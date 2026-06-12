//
//  MoneyLineService.swift
//  SportsGPT
//
//  Created by Jason Schubert on 4/8/26.
//

import Foundation

struct MoneyLineService {
    private enum AIContext: String {
        case eventBestAvailableBet = "event_best_available_bet"
    }

    private let transport: any MoneyLineTransport

    init(transport: (any MoneyLineTransport)? = nil) {
        self.transport = transport ?? MoneyLineTransportFactory.makeDefault()
    }

    func send(messages: [ChatMessage], selectedBookmakers: [Sportsbook], bestBetEvents: [BestBetEvent]) async throws -> MoneyLineAIData {
        let baseMessages = messages
            .filter(\.includeInAPIRequest)
            .suffix(6)
        let enrichedMessages = enrich(messages: Array(baseMessages), using: bestBetEvents)

        let filters: MoneyLineChatRequest.Filters? = selectedBookmakers.isEmpty ? nil : .init(bookmakers: selectedBookmakers.map(\.apiValue))

        let primaryPayload = MoneyLineChatRequest(
            context: nil,
            scope: "large",
            responseFormat: "hybrid",
            filters: filters,
            messages: enrichedMessages.map {
                MoneyLineChatRequest.Message(role: $0.apiRole, content: $0.text)
            }
        )

        let primaryResponse = try await transport.sendChat(payload: primaryPayload)

        let resolvedEvent = resolveEvent(for: enrichedMessages.last?.text ?? "", in: bestBetEvents)

        if shouldRetryAsEventRecommendation(response: primaryResponse, for: enrichedMessages.last?.text),
           let retryMessages = eventResolutionMessages(from: enrichedMessages, using: bestBetEvents) {
            do {
                let retryPayload = MoneyLineChatRequest(
                    context: AIContext.eventBestAvailableBet.rawValue,
                    scope: "large",
                    responseFormat: "hybrid",
                    filters: filters,
                    messages: retryMessages.map {
                        MoneyLineChatRequest.Message(role: $0.apiRole, content: $0.text)
                    }
                )
                let retryResponse = try await transport.sendChat(payload: retryPayload)
                if shouldFallbackToEventBestBets(response: retryResponse),
                   let resolvedEvent {
                    return try await fallbackEventResponse(for: resolvedEvent, selectedBookmakers: selectedBookmakers)
                }
                return retryResponse
            } catch let error as SportsGPTError {
                if case .server(let message) = error,
                   message.localizedCaseInsensitiveContains("matches multiple games") || message.localizedCaseInsensitiveContains("unable to resolve") {
                    if let resolvedEvent {
                        return try await fallbackEventResponse(for: resolvedEvent, selectedBookmakers: selectedBookmakers)
                    }
                    return primaryResponse
                }
                throw error
            }
        }

        if shouldFallbackToEventBestBets(response: primaryResponse),
           let resolvedEvent {
            return try await fallbackEventResponse(for: resolvedEvent, selectedBookmakers: selectedBookmakers)
        }

        return primaryResponse
    }

    func fetchSuggestedPromptSeed(selectedBookmakers: [Sportsbook]) async throws -> SuggestedPromptSeed {
        let onlyBookmaker = selectedBookmakers.count == 1 ? selectedBookmakers.first?.apiValue : nil
        let events = try await transport.fetchBestBets(limit: 8, bookmaker: onlyBookmaker)
        let dynamicPrompts = events
            .compactMap(SuggestedPrompt.init(bestBet:))
            .removingDuplicatePrompts()
            .prefix(4)
            .map { $0 }

        let prompts = ([SuggestedPrompt.bestBetToday] + dynamicPrompts)
            .removingDuplicatePrompts()

        return SuggestedPromptSeed(prompts: prompts, events: events)
    }

    private func enrich(messages: [ChatMessage], using bestBetEvents: [BestBetEvent]) -> [ChatMessage] {
        guard let lastUserIndex = messages.lastIndex(where: \.isUser) else {
            return messages
        }

        guard let resolvedMatchup = resolveMatchup(for: messages[lastUserIndex].text, in: bestBetEvents) else {
            return messages
        }

        var updatedMessages = messages
        let enrichedText = "\(messages[lastUserIndex].text) For event resolution, this refers to the \(resolvedMatchup.resolutionHint) game."
        updatedMessages[lastUserIndex] = .user(text: enrichedText)
        return updatedMessages
    }

    private func eventResolutionMessages(from messages: [ChatMessage], using bestBetEvents: [BestBetEvent]) -> [ChatMessage]? {
        guard let lastUserIndex = messages.lastIndex(where: \.isUser) else {
            return nil
        }

        let currentText = messages[lastUserIndex].text
        guard let resolvedMatchup = resolveMatchup(for: currentText, in: bestBetEvents) else {
            return nil
        }

        var updatedMessages = messages
        updatedMessages[lastUserIndex] = .user(
            text: "\(currentText) This is specifically the \(resolvedMatchup.resolutionHint) game."
        )
        return updatedMessages
    }

    private func resolveEvent(for query: String, in events: [BestBetEvent]) -> BestBetEvent? {
        let normalizedQuery = query.lowercased()

        let ranked = events.compactMap { event -> (Int, BestBetEvent)? in
            guard let matchup = event.matchup else { return nil }
            let teamNames = [matchup.primaryTeam, matchup.opponentTeam]
            let score = teamNames.reduce(into: 0) { partialResult, team in
                let normalizedTeam = team.lowercased()
                if normalizedQuery.contains(normalizedTeam) {
                    partialResult += max(2, normalizedTeam.split(separator: " ").count * 3)
                } else {
                    let tokens = normalizedTeam.split(separator: " ").filter { $0.count >= 4 }
                    if tokens.contains(where: { normalizedQuery.contains($0) }) {
                        partialResult += 2
                    }
                }
            }

            return score > 0 ? (score, event) : nil
        }

        return ranked.sorted { $0.0 > $1.0 }.first?.1
    }

    private func resolveMatchup(for query: String, in events: [BestBetEvent]) -> EventMatchup? {
        resolveEvent(for: query, in: events)?.matchup
    }

    private func shouldRetryAsEventRecommendation(response: MoneyLineAIData, for latestMessage: String?) -> Bool {
        guard let latestMessage else { return false }
        let loweredAnswer = (response.answer ?? response.analysis?.summary ?? "").lowercased()
        let looksLikeMissingData = loweredAnswer.contains("don't see") || loweredAnswer.contains("do not see") || loweredAnswer.contains("need")
        let asksAboutGame = latestMessage.lowercased().contains(" game") || latestMessage.lowercased().contains("tonight")
        return looksLikeMissingData && asksAboutGame
    }

    private func shouldFallbackToEventBestBets(response: MoneyLineAIData) -> Bool {
        let loweredAnswer = (response.answer ?? response.analysis?.summary ?? "").lowercased()
        return loweredAnswer.contains("don't see") || loweredAnswer.contains("do not see") || (response.records ?? []).isEmpty
    }

    private func fallbackEventResponse(for event: BestBetEvent, selectedBookmakers: [Sportsbook]) async throws -> MoneyLineAIData {
        let eventData = try await fetchEventBestBets(eventId: event.eventId, selectedBookmakers: selectedBookmakers)
        guard let matchup = eventData.matchup,
              let moneyline = eventData.markets.first(where: { $0.marketType == "moneyline" }),
              let preferredOutcome = moneyline.outcomes.first else {
            throw SportsGPTError.emptyResponse
        }

        let bestBook = preferredOutcome.bookmakerName ?? "best available book"
        let bestOdds = preferredOutcome.bestOdds.map(Self.formatAmericanOdds) ?? "best available odds"
        let alternativeSentence: String

        if moneyline.outcomes.count > 1, let opponent = moneyline.outcomes.dropFirst().first {
            let altName = opponent.name.cleanedTeamName
            let altOdds = opponent.bestOdds.map(Self.formatAmericanOdds) ?? "N/A"
            let altBook = opponent.bookmakerName ?? "best available book"
            alternativeSentence = "\(altName) moneyline is \(altOdds) on \(altBook)."
        } else {
            alternativeSentence = ""
        }

        let answer = [
            "For the \(matchup.primaryTeam) vs \(matchup.opponentTeam) game, the clearest available line right now is \(preferredOutcome.name.cleanedTeamName) moneyline at \(bestOdds) on \(bestBook).",
            alternativeSentence
        ]
        .filter { !$0.isEmpty }
        .joined(separator: " ")

        let fallbackPresentation = MoneyLineAIData.PresentationInfo(
            responseType: "event_recommendation",
            headline: "\(matchup.primaryTeam) vs \(matchup.opponentTeam)",
            summary: "\(preferredOutcome.name.cleanedTeamName) moneyline is the clearest available event recommendation right now.",
            confidence: "medium",
            entity: .init(matchup: "\(matchup.primaryTeam) vs \(matchup.opponentTeam)"),
            primaryPick: .init(
                recordIndex: nil,
                signalType: "fallback",
                signalLabel: "Event Recommendation",
                selection: preferredOutcome.name.cleanedTeamName,
                marketLabel: "Moneyline",
                market: "moneyline",
                outcome: preferredOutcome.name.cleanedTeamName,
                point: nil,
                odds: preferredOutcome.bestOdds,
                oddsDisplay: bestOdds,
                bookmakerName: preferredOutcome.bookmakerName,
                bookmakerId: nil,
                sourceType: nil,
                confidence: "medium",
                rationale: "This is the strongest currently available line from the event best-bets feed.",
                reason: nil,
                metrics: nil,
                event: .init(
                    matchup: "\(matchup.primaryTeam) vs \(matchup.opponentTeam)",
                    startTime: eventData.startTime
                )
            ),
            alternativePick: moneyline.outcomes.count > 1 ? moneyline.outcomes.dropFirst().first.map { opponent in
                .init(
                    recordIndex: nil,
                    signalType: "fallback",
                    signalLabel: "Secondary Option",
                    selection: opponent.name.cleanedTeamName,
                    marketLabel: "Moneyline",
                    market: "moneyline",
                    outcome: opponent.name.cleanedTeamName,
                    point: nil,
                    odds: opponent.bestOdds,
                    oddsDisplay: opponent.bestOdds.map(Self.formatAmericanOdds),
                    bookmakerName: opponent.bookmakerName,
                    bookmakerId: nil,
                    sourceType: nil,
                    confidence: "low",
                    rationale: "This is the other currently available moneyline side for the same event.",
                    reason: nil,
                    metrics: nil,
                    event: .init(
                        matchup: "\(matchup.primaryTeam) vs \(matchup.opponentTeam)",
                        startTime: eventData.startTime
                    )
                )
            } : nil,
            cards: eventData.markets.flatMap { market in
                market.outcomes.prefix(2).map { outcome in
                    MoneyLineAIData.PresentationInfo.CardInfo(
                        recordIndex: nil,
                        signalType: "fallback",
                        signalLabel: market.marketType.cardFriendlyTitle,
                        selection: market.marketType == "moneyline"
                            ? outcome.name.cleanedTeamName
                            : outcome.name.cleanedTeamName,
                        marketLabel: market.marketType.cardFriendlyTitle,
                        market: market.marketType,
                        outcome: outcome.name.cleanedTeamName,
                        point: nil,
                        odds: outcome.bestOdds,
                        oddsDisplay: outcome.bestOdds.map(Self.formatAmericanOdds),
                        bookmakerName: outcome.bookmakerName,
                        bookmakerId: nil,
                        sourceType: nil,
                        confidence: nil,
                        rationale: nil,
                        reason: "Available event line",
                        metrics: nil,
                        event: .init(
                            matchup: "\(matchup.primaryTeam) vs \(matchup.opponentTeam)",
                            startTime: eventData.startTime
                        )
                    )
                }
            },
            sourceLabel: "Event Recommendation"
        )

        let records = eventData.markets.flatMap { market in
            market.outcomes.map { outcome in
                JSONValue.object([
                    "recordType": .string("best_bet"),
                    "eventId": .string(eventData.eventId),
                    "eventName": .string("\(matchup.primaryTeam) vs \(matchup.opponentTeam)"),
                    "title": .string(market.marketType.cardFriendlyTitle),
                    "selection": .string(
                        market.marketType == "moneyline"
                            ? "\(outcome.name.cleanedTeamName) Moneyline"
                            : outcome.name.cleanedTeamName
                    ),
                    "outcome": .string(outcome.name.cleanedTeamName),
                    "bookmakerName": .string(outcome.bookmakerName ?? "Best Book"),
                    "bestOdds": .string(outcome.bestOdds.map(Self.formatAmericanOdds) ?? ""),
                    "marketType": .string(market.marketType),
                    "market": .string(market.marketType),
                    "sport": .string(eventData.sport ?? ""),
                    "league": .string(eventData.leagueId ?? "")
                ])
            }
        }

        return MoneyLineAIData(answer: answer, analysis: nil, presentation: fallbackPresentation, records: records, context: nil, sources: nil)
    }

    private func fetchEventBestBets(eventId: String, selectedBookmakers: [Sportsbook]) async throws -> BestBetEvent {
        let onlyBookmaker = selectedBookmakers.count == 1 ? selectedBookmakers.first?.apiValue : nil
        return try await transport.fetchEventBestBets(eventId: eventId, bookmaker: onlyBookmaker)
    }

    private static func formatAmericanOdds(_ value: Double) -> String {
        let intValue = Int(value)
        return intValue > 0 ? "+\(intValue)" : "\(intValue)"
    }
}

private extension Array where Element: Hashable {
    func removingDuplicates() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}

private extension Array where Element == SuggestedPrompt {
    func removingDuplicatePrompts() -> [SuggestedPrompt] {
        var seen = Set<String>()
        return filter { seen.insert($0.text).inserted }
    }
}

enum SportsGPTError: LocalizedError {
    case invalidURL
    case invalidResponse
    case emptyResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "The MoneyLine AI URL is invalid."
        case .invalidResponse:
            return "The MoneyLine AI response was invalid."
        case .emptyResponse:
            return "MoneyLine AI returned an empty response."
        case .server(let message):
            return message
        }
    }
}
