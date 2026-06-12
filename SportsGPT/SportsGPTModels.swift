//
//  SportsGPTModels.swift
//  SportsGPT
//
//  Created by Jason Schubert on 4/8/26.
//

import Combine
import Foundation
import RevenueCat
import SwiftUI
import UIKit

@MainActor
final class SportsGPTViewModel: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var input = ""
    @Published var isLoading = false
    @Published var isLoadingSuggestedPrompts = false
    @Published var errorMessage: String?
    @Published var selectedSportsbooks = Set<Sportsbook>()
    @Published var suggestedPrompts: [SuggestedPrompt] = []
    @Published private(set) var suggestedBestBetEvents: [BestBetEvent] = []
    var hasAutoFocusedComposer = false

    let thinkingTimer = Timer.publish(every: 1.2, on: .main, in: .common).autoconnect()

    private let service: MoneyLineService

    init(service: MoneyLineService = MoneyLineService()) {
        self.service = service
    }

    var canSend: Bool {
        !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var sportsbookSummary: String {
        if selectedSportsbooks.isEmpty {
            return "All books"
        }

        if selectedSportsbooks.count == 1, let book = selectedSportsbooks.first {
            return book.name
        }

        return "\(selectedSportsbooks.count) books"
    }

    func loadWelcomeState() {
        messages = [
            ChatMessage.assistant(
                text: "Ask me anything betting related!",
                includeInAPIRequest: false
            )
        ]
    }

    func loadSuggestedPrompts() async {
        isLoadingSuggestedPrompts = true
        defer { isLoadingSuggestedPrompts = false }

        do {
            let seedData = try await service.fetchSuggestedPromptSeed(
                selectedBookmakers: selectedSportsbooks.sorted { $0.name < $1.name }
            )
            suggestedPrompts = seedData.prompts
            suggestedBestBetEvents = seedData.events
        } catch {
            suggestedPrompts = []
            suggestedBestBetEvents = []
        }
    }

    func sendMessage() async -> Bool {
        let trimmedInput = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedInput.isEmpty, !isLoading else { return false }

        errorMessage = nil
        input = ""

        withAnimation(.spring(duration: 0.35)) {
            messages.append(.user(text: trimmedInput))
            isLoading = true
        }

        do {
            let response = try await service.send(
                messages: messages,
                selectedBookmakers: selectedSportsbooks.sorted { $0.name < $1.name },
                bestBetEvents: suggestedBestBetEvents
            )
            let assistantMessage = ChatMessage.assistant(
                text: response.formattedAnswer,
                summaryChips: response.summaryChips,
                recordCards: response.displayCards,
                assistantPresentation: response.assistantPresentation
            )

            withAnimation(.spring(duration: 0.4)) {
                messages.append(assistantMessage)
                isLoading = false
            }
            return true
        } catch {
            withAnimation(.spring(duration: 0.35)) {
                isLoading = false
            }

            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            return false
        }
    }

    func dismissError() {
        errorMessage = nil
    }

    func sendSuggestedPrompt(_ prompt: SuggestedPrompt) async -> Bool {
        input = prompt.text
        return await sendMessage()
    }

    var shouldShowSuggestedPrompts: Bool {
        messages.count <= 1 && !suggestedPrompts.isEmpty
    }

    var shouldShowSuggestedPromptLoading: Bool {
        messages.count <= 1 && isLoadingSuggestedPrompts && suggestedPrompts.isEmpty
    }
}

struct ChatMessage: Identifiable, Equatable {
    enum Role: String {
        case user
        case assistant
    }

    let id = UUID()
    let role: Role
    let text: String
    let summaryChips: [String]
    let recordCards: [DisplayRecordCard]
    let includeInAPIRequest: Bool
    let assistantPresentation: AssistantPresentation?

    var isUser: Bool {
        role == .user
    }

    var apiRole: String {
        role.rawValue
    }

    static func user(text: String) -> ChatMessage {
        ChatMessage(
            role: .user,
            text: text,
            summaryChips: [],
            recordCards: [],
            includeInAPIRequest: true,
            assistantPresentation: nil
        )
    }

    static func assistant(
        text: String,
        summaryChips: [String] = [],
        recordCards: [DisplayRecordCard] = [],
        includeInAPIRequest: Bool = true,
        assistantPresentation: AssistantPresentation? = nil
    ) -> ChatMessage {
        ChatMessage(
            role: .assistant,
            text: text,
            summaryChips: summaryChips,
            recordCards: recordCards,
            includeInAPIRequest: includeInAPIRequest,
            assistantPresentation: assistantPresentation
        )
    }
}

struct AssistantPresentation: Equatable {
    enum Confidence: String, Equatable {
        case high
        case medium
        case low

        var label: String {
            rawValue.capitalized
        }
    }

    enum MetricKind: String, Equatable, Hashable {
        case edge
        case ev
        case implied
        case model
    }

    struct MetricSnapshot: Equatable {
        let edgePct: Double?
        let evPct: Double?
        let impliedProb: Double?
        let modelProb: Double?
    }

    struct Fact: Identifiable, Equatable, Hashable {
        let id = UUID()
        let label: String
        let value: String
        let kind: MetricKind?
    }

    struct Recommendation: Identifiable, Equatable {
        let id = UUID()
        let signalLabel: String?
        let selection: String
        let contextLabel: String?
        let eventStartTime: Date?
        let marketLabel: String?
        let oddsDisplay: String?
        let bookmakerName: String?
        let sourceType: String?
        let confidence: Confidence?
        let rationale: String?
        let facts: [Fact]
        let metricSnapshot: MetricSnapshot?
    }

    let headline: String?
    let summary: String?
    let sourceLabel: String?
    let confidence: Confidence?
    let entityMatchup: String?
    let primaryPick: Recommendation?
    let alternativePick: Recommendation?
    let cards: [Recommendation]
    let expandedExplanation: String?
}

struct DisplayRecordCard: Identifiable, Equatable {
    enum FactStyle: String, Equatable {
        case accent
        case secondary
        case book
        case neutral
    }

    struct Fact: Identifiable, Equatable, Hashable {
        let id = UUID()
        let label: String
        let value: String
        let style: FactStyle
    }

    struct Detail: Identifiable, Equatable {
        let id = UUID()
        let label: String
        let value: String
    }

    let id = UUID()
    let title: String?
    let subtitle: String?
    let keyFacts: [Fact]
    let details: [Detail]
}

struct Sportsbook: Identifiable, Hashable {
    let id: String
    let name: String
    let apiValue: String

    static let all: [Sportsbook] = [
        .init(id: "draftkings", name: "DraftKings", apiValue: "draftkings"),
        .init(id: "fanduel", name: "FanDuel", apiValue: "fanduel"),
        .init(id: "betmgm", name: "BetMGM", apiValue: "betmgm"),
        .init(id: "caesars", name: "Caesars", apiValue: "caesars"),
        .init(id: "pointsbet_us", name: "PointsBet (US)", apiValue: "pointsbet_us"),
        .init(id: "williamhill_us", name: "William Hill (US)", apiValue: "williamhill_us"),
        .init(id: "betrivers", name: "BetRivers", apiValue: "betrivers"),
        .init(id: "unibet_us", name: "Unibet (US)", apiValue: "unibet_us"),
        .init(id: "bovada", name: "Bovada", apiValue: "bovada"),
        .init(id: "betonlineag", name: "BetOnline.ag", apiValue: "betonlineag"),
        .init(id: "mybookieag", name: "MyBookie.ag", apiValue: "mybookieag"),
        .init(id: "lowvig", name: "LowVig.ag", apiValue: "lowvig"),
        .init(id: "barstool", name: "Barstool Sportsbook", apiValue: "barstool"),
        .init(id: "betus", name: "BetUS", apiValue: "betus"),
        .init(id: "wynnbet", name: "WynnBET", apiValue: "wynnbet"),
        .init(id: "superbook", name: "SuperBook", apiValue: "superbook"),
        .init(id: "bet365_us", name: "bet365 (US)", apiValue: "bet365_us"),
        .init(id: "espnbet", name: "ESPN BET", apiValue: "espnbet"),
        .init(id: "fanatics", name: "Fanatics", apiValue: "fanatics"),
        .init(id: "fliff", name: "Fliff", apiValue: "fliff"),
        .init(id: "hardrockbet", name: "Hard Rock Bet", apiValue: "hardrockbet"),
        .init(id: "hardrockbet_az", name: "Hard Rock Bet (AZ)", apiValue: "hardrockbet_az"),
        .init(id: "tipico_us", name: "Tipico (US)", apiValue: "tipico_us"),
        .init(id: "betanysports", name: "BetAnySports", apiValue: "betanysports"),
        .init(id: "betr_us", name: "Betr (US)", apiValue: "betr_us"),
        .init(id: "pinnacle", name: "Pinnacle", apiValue: "pinnacle"),
        .init(id: "betparx", name: "betParx", apiValue: "betparx"),
        .init(id: "ballybet", name: "Bally Bet", apiValue: "ballybet"),
        .init(id: "rebet", name: "Rebet", apiValue: "rebet"),
        .init(id: "prizepicks", name: "PrizePicks", apiValue: "prizepicks"),
        .init(id: "underdog", name: "Underdog Fantasy", apiValue: "underdog"),
        .init(id: "draftkings_pick6", name: "DraftKings Pick6", apiValue: "draftkings_pick6"),
        .init(id: "betr_picks", name: "Betr Picks", apiValue: "betr_picks"),
        .init(id: "betfair_exchange_us", name: "Betfair Exchange (US)", apiValue: "betfair_exchange_us"),
        .init(id: "sporttrade", name: "Sporttrade", apiValue: "sporttrade"),
        .init(id: "kalshi", name: "Kalshi", apiValue: "kalshi"),
        .init(id: "novig", name: "Novig", apiValue: "novig"),
        .init(id: "polymarket", name: "Polymarket", apiValue: "polymarket"),
        .init(id: "prophetx", name: "ProphetX", apiValue: "prophetx"),
        .init(id: "betopenly", name: "BetOpenly", apiValue: "betopenly")
    ]
}

enum SubscriptionState: Equatable {
    case neverSubscribed
    case activeTrial(renewalDate: Date?)
    case activeSubscriber(renewalDate: Date?)

    var statusTitle: String {
        switch self {
        case .neverSubscribed:
            return "Free Plan"
        case .activeTrial:
            return "Trial Active"
        case .activeSubscriber:
            return "SportsGPT Pro"
        }
    }

    var statusDetail: String {
        switch self {
        case .neverSubscribed:
            return "Upgrade to unlock the full SportsGPT experience."
        case .activeTrial(let renewalDate):
            if let renewalDate {
                return "Your free trial is active through \(renewalDate.shortMonthDayText)."
            }
            return "Your free trial is active."
        case .activeSubscriber(let renewalDate):
            if let renewalDate {
                return "Your subscription is active and renews on \(renewalDate.shortMonthDayText)."
            }
            return "Your subscription is active."
        }
    }

    var ctaTitle: String {
        switch self {
        case .neverSubscribed:
            return "Upgrade"
        case .activeTrial:
            return "Manage Account"
        case .activeSubscriber:
            return "Manage Account"
        }
    }

    var accountBadgeTitle: String {
        switch self {
        case .neverSubscribed:
            return "Free"
        case .activeTrial:
            return "Trial"
        case .activeSubscriber:
            return "Pro"
        }
    }

    var planName: String {
        switch self {
        case .neverSubscribed:
            return "SportsGPT Free"
        case .activeTrial:
            return "SportsGPT Pro Trial"
        case .activeSubscriber:
            return "SportsGPT Pro"
        }
    }

    var billingStatus: String {
        switch self {
        case .neverSubscribed:
            return "No active subscription"
        case .activeTrial:
            return "Trial in progress"
        case .activeSubscriber:
            return "Paid and active"
        }
    }

    var timingLabel: String {
        switch self {
        case .neverSubscribed:
            return "Next Step"
        case .activeTrial:
            return "Trial Ends"
        case .activeSubscriber:
            return "Renews"
        }
    }

    var timingValue: String {
        switch self {
        case .neverSubscribed:
            return "Upgrade whenever you’re ready"
        case .activeTrial(let renewalDate):
            if let renewalDate {
                return renewalDate.shortMonthDayText
            }
            return "Trial timing will appear here"
        case .activeSubscriber(let renewalDate):
            if let renewalDate {
                return renewalDate.shortMonthDayText
            }
            return "Renewal timing will appear here"
        }
    }

    var accountSettingsDescription: String {
        switch self {
        case .neverSubscribed:
            return "You’re currently on the free plan. This is where you’ll review pricing, subscription access, and account controls."
        case .activeTrial:
            return "Your Pro trial is active. This screen is where you’ll review trial timing, conversion details, and billing information."
        case .activeSubscriber:
            return "Your paid subscription is active. This is where renewal details, billing management, and premium-only settings live."
        }
    }

    var manageButtonTitle: String {
        switch self {
        case .neverSubscribed:
            return "See Upgrade Options"
        case .activeTrial:
            return "Review Trial Details"
        case .activeSubscriber:
            return "Manage Subscription"
        }
    }

    var managementNote: String {
        switch self {
        case .neverSubscribed:
            return "Free users see upgrade options here."
        case .activeTrial:
            return "Trial users can review conversion timing and billing here."
        case .activeSubscriber:
            return "Paid users can review renewals and premium settings here."
        }
    }
}

struct PaywallFeature: Identifiable, Hashable {
    let id = UUID()
    let symbol: String
    let title: String
    let detail: String
}

enum SubscriptionPlanKind: String, Hashable {
    case yearly
    case lifetime
    case monthly

    var displayName: String {
        switch self {
        case .yearly:
            return "Yearly"
        case .lifetime:
            return "Lifetime"
        case .monthly:
            return "Monthly"
        }
    }

    var packageType: PackageType {
        switch self {
        case .yearly:
            return .annual
        case .lifetime:
            return .lifetime
        case .monthly:
            return .monthly
        }
    }
}

struct PaywallPlan: Identifiable, Hashable {
    let id = UUID()
    let kind: SubscriptionPlanKind
    let title: String
    let price: String
    let cadence: String
    let badge: String?
    let detail: String
    let footnote: String
}

enum PaywallContext: Equatable {
    case standard
    case requestLimitReached
}

@MainActor
final class SubscriptionStore: ObservableObject {
    private enum StorageKeys {
        static let areChatAdsEnabled = "areChatAdsEnabled"
        static let freeRequestCount = "freeRequestCount"
    }

    @Published var state: SubscriptionState = .neverSubscribed
    @Published var isPaywallPresented = false
    @Published var isAdPreferencesPresented = false
    @Published var isAccountSettingsPresented = false
    @Published var areChatAdsEnabled = true {
        didSet {
            userDefaults.set(areChatAdsEnabled, forKey: StorageKeys.areChatAdsEnabled)
        }
    }
    @Published var paywallContext: PaywallContext = .standard
    @Published var freeRequestCount = 0 {
        didSet {
            userDefaults.set(freeRequestCount, forKey: StorageKeys.freeRequestCount)
        }
    }
    @Published var isSubscriptionOperationInProgress = false
    @Published var subscriptionErrorMessage: String?
    @Published private(set) var managementURL: URL?

    let freeRequestLimit = 10

    private let revenueCatService: any RevenueCatSubscriptionServicing
    private let userDefaults: UserDefaults

    let features: [PaywallFeature] = [
        .init(symbol: "bubble.left.and.bubble.right.fill", title: "Ad-free chat", detail: "Keep every answer focused without promotional interruptions under the conversation."),
        .init(symbol: "infinity", title: "Unlimited questions", detail: "Go beyond the 10 free asks so you can keep comparing books, lines, and follow-up angles."),
        .init(symbol: "chart.line.uptrend.xyaxis", title: "Sharper betting context", detail: "Get the cleanest SportsGPT experience with deeper MoneyLine-backed market coverage."),
        .init(symbol: "bolt.fill", title: "Stay in flow", detail: "Work through more ideas without hitting the free cap right when the chat gets useful.")
    ]

    let plans: [PaywallPlan] = [
        .init(kind: .yearly, title: "Yearly", price: "$29.99", cadence: "per year", badge: "Most Popular", detail: "Lowest effective monthly price if SportsGPT becomes part of your regular workflow.", footnote: "$0.58 Weekly"),
        .init(kind: .lifetime, title: "Lifetime", price: "$49.99", cadence: "one-time", badge: "Pay Once", detail: "One purchase, then keep Pro access without a recurring bill.", footnote: "Own Pro Forever"),
        .init(kind: .monthly, title: "Monthly", price: "$9.99", cadence: "per month", badge: nil, detail: "Best if you want flexibility or only need Pro month to month.", footnote: "$2.31 Weekly")
    ]

    init(
        revenueCatService: (any RevenueCatSubscriptionServicing)? = nil,
        userDefaults: UserDefaults = .standard
    ) {
        self.revenueCatService = revenueCatService ?? RevenueCatSubscriptionService.shared
        self.userDefaults = userDefaults
        self.areChatAdsEnabled = userDefaults.object(forKey: StorageKeys.areChatAdsEnabled) as? Bool ?? true
        self.freeRequestCount = userDefaults.integer(forKey: StorageKeys.freeRequestCount)

        Task {
            await refreshSubscriptionState()
        }
    }

    var isPremium: Bool {
        switch state {
        case .activeTrial, .activeSubscriber:
            return true
        case .neverSubscribed:
            return false
        }
    }

    func presentPaywall(context: PaywallContext = .standard) {
        paywallContext = context
        isPaywallPresented = true
    }

    func dismissPaywall() {
        isPaywallPresented = false
        paywallContext = .standard
    }

    func presentAdPreferences() {
        isAdPreferencesPresented = true
    }

    func dismissAdPreferences() {
        isAdPreferencesPresented = false
    }

    func presentAccountSettings() {
        isAccountSettingsPresented = true
    }

    func dismissAccountSettings() {
        isAccountSettingsPresented = false
    }

    func updateFromRevenueCat(entitlementIsActive: Bool, isTrial: Bool, renewalDate: Date?) {
        if entitlementIsActive && isTrial {
            state = .activeTrial(renewalDate: renewalDate)
        } else if entitlementIsActive {
            state = .activeSubscriber(renewalDate: renewalDate)
        } else {
            state = .neverSubscribed
            areChatAdsEnabled = true
        }
    }

    func refreshSubscriptionState() async {
        guard revenueCatService.isConfigured else {
            managementURL = nil
            return
        }

        subscriptionErrorMessage = nil

        do {
            let snapshot = try await revenueCatService.currentSnapshot()
            apply(snapshot: snapshot)
        } catch {
            subscriptionErrorMessage = nil
        }
    }

    @discardableResult
    func purchase(plan: PaywallPlan) async -> Bool {
        guard revenueCatService.isConfigured else {
            subscriptionErrorMessage = RevenueCatServiceError.missingAPIKey.errorDescription
            return false
        }

        subscriptionErrorMessage = nil
        isSubscriptionOperationInProgress = true
        defer { isSubscriptionOperationInProgress = false }

        do {
            let snapshot = try await revenueCatService.purchase(planKind: plan.kind)
            apply(snapshot: snapshot)
            return snapshot.entitlementIsActive
        } catch RevenueCatServiceError.purchaseCancelled {
            return false
        } catch {
            subscriptionErrorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            return false
        }
    }

    @discardableResult
    func restorePurchases() async -> Bool {
        guard revenueCatService.isConfigured else {
            subscriptionErrorMessage = RevenueCatServiceError.missingAPIKey.errorDescription
            return false
        }

        subscriptionErrorMessage = nil
        isSubscriptionOperationInProgress = true
        defer { isSubscriptionOperationInProgress = false }

        do {
            let snapshot = try await revenueCatService.restorePurchases()
            apply(snapshot: snapshot)
            if !snapshot.entitlementIsActive {
                subscriptionErrorMessage = "No active purchases were found to restore."
            }
            return snapshot.entitlementIsActive
        } catch {
            subscriptionErrorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            return false
        }
    }

    func clearSubscriptionError() {
        subscriptionErrorMessage = nil
    }

    func openManageSubscriptions() {
        guard let url = managementURL ?? URL(string: "https://apps.apple.com/account/subscriptions") else {
            return
        }

        UIApplication.shared.open(url)
    }

    var canManageAds: Bool {
        if case .activeSubscriber = state {
            return true
        }
        return false
    }

    var remainingFreeRequests: Int {
        max(0, freeRequestLimit - freeRequestCount)
    }

    var hasReachedFreeLimit: Bool {
        !isPremium && freeRequestCount >= freeRequestLimit
    }

    func canSendNewRequest() -> Bool {
        !hasReachedFreeLimit
    }

    func recordSuccessfulRequest() {
        guard !isPremium else { return }
        freeRequestCount += 1
    }

    var subscriptionActionTitle: String {
        switch state {
        case .neverSubscribed:
            return "Start Subscription"
        case .activeTrial:
            return "Manage Account"
        case .activeSubscriber:
            return "Manage Account"
        }
    }

    var accountActionTitle: String {
        state.manageButtonTitle
    }

    private func apply(snapshot: RevenueCatSubscriptionSnapshot) {
        updateFromRevenueCat(
            entitlementIsActive: snapshot.entitlementIsActive,
            isTrial: snapshot.isTrial,
            renewalDate: snapshot.renewalDate
        )
        managementURL = snapshot.managementURL

        if snapshot.entitlementIsActive {
            dismissPaywall()
        }
    }
}

struct SuggestedPrompt: Identifiable, Hashable {
    let id: String
    let text: String
    let shortLabel: String

    static let bestBetToday = SuggestedPrompt(
        id: "best-bet-today",
        text: "What's the best bet today?",
        shortLabel: "Best Bet Today"
    )

    init(id: String, text: String, shortLabel: String) {
        self.id = id
        self.text = text
        self.shortLabel = shortLabel
    }

    init?(bestBet: BestBetEvent) {
        guard let matchup = bestBet.matchup else {
            return nil
        }

        self.init(
            id: bestBet.eventId,
            text: "What are the best bets for the \(matchup.shortPromptText)?",
            shortLabel: matchup.shortLabel
        )
    }
}

struct MoneyLineChatRequest: Encodable {
    struct Filters: Encodable {
        let bookmakers: [String]
    }

    struct Message: Encodable {
        let role: String
        let content: String
    }

    let context: String?
    let scope: String
    let responseFormat: String
    let filters: Filters?
    let messages: [Message]

    enum CodingKeys: String, CodingKey {
        case context
        case scope
        case responseFormat
        case filters
        case messages
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        if let context {
            try container.encode(context, forKey: .context)
        }
        try container.encode(scope, forKey: .scope)
        try container.encode(responseFormat, forKey: .responseFormat)
        try container.encode(messages, forKey: .messages)

        if let filters, !filters.bookmakers.isEmpty {
            try container.encode(filters, forKey: .filters)
        }
    }
}

struct BestBetsResponse: Decodable {
    struct APIError: Decodable {
        let message: String
    }

    let success: Bool
    let data: [BestBetEvent]?
    let error: APIError?
}

struct EventBestBetsResponse: Decodable {
    struct APIError: Decodable {
        let message: String
    }

    let success: Bool
    let data: BestBetEvent?
    let error: APIError?
}

struct BestBetEvent: Decodable, Hashable {
    struct Market: Decodable, Hashable {
        struct Outcome: Decodable, Hashable {
            let name: String
            let bestOdds: Double?
            let bookmakerId: String?
            let bookmakerName: String?
        }

        let marketType: String
        let outcomes: [Outcome]
    }

    let eventId: String
    let markets: [Market]
    let leagueId: String?
    let sport: String?
    let startTime: String?
}

extension BestBetEvent {
    var matchup: EventMatchup? {
        guard let market = markets.first(where: { $0.marketType == "moneyline" }) ?? markets.first else {
            return nil
        }

        let teamNames = market.outcomes
            .compactMap(\.name)
            .map(\.cleanedTeamName)
            .filter { !$0.isEmpty }
            .uniqued()

        guard let primaryTeam = teamNames.first else { return nil }
        let opponentTeam = teamNames.dropFirst().first ?? "their opponent"

        return EventMatchup(
            primaryTeam: primaryTeam,
            opponentTeam: opponentTeam,
            sport: sport,
            leagueId: leagueId
        )
    }
}

struct SuggestedPromptSeed {
    let prompts: [SuggestedPrompt]
    let events: [BestBetEvent]
}

struct EventMatchup: Hashable {
    let primaryTeam: String
    let opponentTeam: String
    let sport: String?
    let leagueId: String?

    var shortLabel: String {
        "\(primaryTeam) vs \(opponentTeam)"
    }

    var shortPromptText: String {
        let sportText = sportDisplayName
        if let sportText {
            return "\(primaryTeam) vs \(opponentTeam) \(sportText) game"
        }
        return "\(primaryTeam) vs \(opponentTeam) game"
    }

    var resolutionHint: String {
        var parts: [String] = []
        if let leagueId {
            parts.append(leagueId.uppercased())
        }
        if let sportDisplayName {
            parts.append(sportDisplayName)
        }
        parts.append("\(primaryTeam) vs \(opponentTeam)")
        return parts.joined(separator: " ")
    }

    private var sportDisplayName: String? {
        guard let sport else { return nil }
        switch sport.lowercased() {
        case "basketball": return "basketball"
        case "baseball": return "baseball"
        case "football": return "football"
        case "hockey": return "hockey"
        default: return sport.lowercased()
        }
    }
}

struct MoneyLineAIResponse: Decodable {
    struct APIError: Decodable {
        let message: String
    }

    let success: Bool
    let data: MoneyLineAIData?
    let error: APIError?
}

struct MoneyLineAIData: Decodable {
    struct AnalysisInfo: Decodable {
        let summary: String?
        let highlights: [String]?
    }

    struct ContextInfo: Decodable {
        let requestedContext: String?
        let resolvedContext: String?
        let inferred: Bool?
        let scope: String?
        let responseFormat: String?
    }

    struct SourceInfo: Decodable {
        let label: String?
        let primary: String?
    }

    struct PresentationInfo: Decodable {
        struct Entity: Decodable {
            let matchup: String?
        }

        struct Metrics: Decodable {
            let edgePct: Double?
            let evPct: Double?
            let ev: Double?
            let profitPct: Double?
            let guaranteedProfit: Double?
            let impliedProb: Double?
            let modelProb: Double?
        }

        struct RecommendationInfo: Decodable {
            struct EventInfo: Decodable {
                let matchup: String?
                let startTime: String?
            }

            let recordIndex: Int?
            let signalType: String?
            let signalLabel: String?
            let selection: String?
            let marketLabel: String?
            let market: String?
            let outcome: String?
            let point: JSONValue?
            let odds: Double?
            let oddsDisplay: String?
            let bookmakerName: String?
            let bookmakerId: String?
            let sourceType: String?
            let confidence: String?
            let rationale: String?
            let reason: String?
            let metrics: Metrics?
            let event: EventInfo?
        }

        typealias CardInfo = RecommendationInfo

        let responseType: String?
        let headline: String?
        let summary: String?
        let confidence: String?
        let entity: Entity?
        let primaryPick: RecommendationInfo?
        let alternativePick: RecommendationInfo?
        let cards: [CardInfo]?
        let sourceLabel: String?
    }

    let answer: String?
    let analysis: AnalysisInfo?
    let presentation: PresentationInfo?
    let records: [JSONValue]?
    let context: ContextInfo?
    let sources: SourceInfo?
    let primaryRecommendation: JSONValue?
    let alternativeRecommendation: JSONValue?
    let alternativeRecords: [JSONValue]?
    let entityResolution: JSONValue?

    init(
        answer: String? = nil,
        analysis: AnalysisInfo? = nil,
        presentation: PresentationInfo? = nil,
        records: [JSONValue]? = nil,
        context: ContextInfo? = nil,
        sources: SourceInfo? = nil,
        primaryRecommendation: JSONValue? = nil,
        alternativeRecommendation: JSONValue? = nil,
        alternativeRecords: [JSONValue]? = nil,
        entityResolution: JSONValue? = nil
    ) {
        self.answer = answer
        self.analysis = analysis
        self.presentation = presentation
        self.records = records
        self.context = context
        self.sources = sources
        self.primaryRecommendation = primaryRecommendation
        self.alternativeRecommendation = alternativeRecommendation
        self.alternativeRecords = alternativeRecords
        self.entityResolution = entityResolution
    }

    var summaryChips: [String] {
        []
    }

    var displayCards: [DisplayRecordCard] {
        []
    }

    var formattedAnswer: String {
        if let presentation {
            return presentation.summary ?? presentation.headline ?? answer ?? analysis?.summary ?? ""
        }

        if answer != nil {
            return formattedResponse.text
        }

        return analysis?.summary ?? ""
    }

    var assistantPresentation: AssistantPresentation? {
        if let presentation {
            let recordObjects = records?.compactMap(\.objectValue) ?? []
            let resolvedEvent = resolvedPresentationEvent(for: presentation)
            let primaryPick = presentation.primaryPick?.assistantRecommendation(
                record: presentation.primaryPick?.recordIndex.flatMap { recordObjects[safe: $0] },
                presentationEvent: resolvedEvent
            )
            let alternativePick = presentation.alternativePick?.assistantRecommendation(
                record: presentation.alternativePick?.recordIndex.flatMap { recordObjects[safe: $0] },
                presentationEvent: resolvedEvent
            )
            let hiddenKeys = Set([
                primaryPick?.displayDedupKey,
                alternativePick?.displayDedupKey
            ].compactMap { $0 })
            let supportingCards = (presentation.cards ?? [])
                .compactMap { card in
                    card.assistantRecommendation(
                        record: card.recordIndex.flatMap { recordObjects[safe: $0] },
                        presentationEvent: resolvedEvent,
                        requiresReadableContext: true
                    )
                }
                .filter { !hiddenKeys.contains($0.displayDedupKey) }
                .uniqued(by: { $0.displayDedupKey })

            return AssistantPresentation(
                headline: presentation.headline?.trimmed.nilIfEmpty,
                summary: presentation.summary?.trimmed.nilIfEmpty,
                sourceLabel: presentation.sourceLabel?.trimmed.nilIfEmpty,
                confidence: .from(presentation.confidence),
                entityMatchup: resolvedEvent?.matchup,
                primaryPick: primaryPick,
                alternativePick: alternativePick,
                cards: supportingCards,
                expandedExplanation: expandedExplanation
            )
        }

        if answer != nil {
            return formattedResponse.presentation
        }

        return nil
    }

    private var formattedResponse: SportsGPTAnswerFormatter.FormattedResponse {
        SportsGPTAnswerFormatter.format(answer ?? analysis?.summary ?? "")
    }

    private var expandedExplanation: String? {
        if let answer = answer?.trimmed.nilIfEmpty,
           answer.caseInsensitiveTrimmed != presentation?.summary?.caseInsensitiveTrimmed {
            return answer
        }

        if let summary = analysis?.summary?.trimmed.nilIfEmpty,
           summary.caseInsensitiveTrimmed != presentation?.summary?.caseInsensitiveTrimmed {
            return summary
        }

        if let highlights = analysis?.highlights, !highlights.isEmpty {
            return highlights.joined(separator: "\n")
        }

        return nil
    }

    private func resolvedPresentationEvent(
        for presentation: PresentationInfo
    ) -> PresentationResolvedEvent? {
        if let primaryEvent = presentation.primaryPick?.event?.resolvedEvent {
            return primaryEvent
        }

        if let cardEvent = presentation.cards?.first?.event?.resolvedEvent {
            return cardEvent
        }

        return nil
    }
}

private struct PresentationResolvedEvent {
    let matchup: String?
    let startTime: Date?
}

private extension AssistantPresentation.Confidence {
    static func from(_ rawValue: String?) -> AssistantPresentation.Confidence? {
        guard let rawValue = rawValue?.lowercased() else { return nil }
        return AssistantPresentation.Confidence(rawValue: rawValue)
    }
}

private extension MoneyLineAIData.PresentationInfo.RecommendationInfo {
    func assistantRecommendation(
        record: [String: JSONValue]? = nil,
        presentationEvent: PresentationResolvedEvent? = nil,
        requiresReadableContext: Bool = false
    ) -> AssistantPresentation.Recommendation? {
        let primarySelection = selection?.trimmed.nilIfEmpty
            ?? normalizedSelectionFromOutcome

        guard let primarySelection else { return nil }
        let preferredMarketLabel = marketLabel?.trimmed.nilIfEmpty
            ?? market?.cardFriendlyTitle.nilIfEmpty
        let renderedSelection = displaySelection(from: primarySelection, record: record)
        let readableContext = presentationEvent?.matchup?.cardFriendlyMatchup.nilIfEmpty
        let hasStandaloneSubject = renderedSelection.hasStandaloneBetSubject(market: preferredMarketLabel)
        let contextLabel = readableContext

        if requiresReadableContext && !hasStandaloneSubject && contextLabel == nil {
            return nil
        }

        return AssistantPresentation.Recommendation(
            signalLabel: signalLabel?.trimmed.nilIfEmpty,
            selection: renderedSelection,
            contextLabel: contextLabel,
            eventStartTime: presentationEvent?.startTime,
            marketLabel: preferredMarketLabel,
            oddsDisplay: displayOdds,
            bookmakerName: bookmakerName?.trimmed.nilIfEmpty,
            sourceType: sourceType?.readableLabel.nilIfEmpty,
            confidence: .from(confidence),
            rationale: (rationale ?? reason)?.trimmed.nilIfEmpty,
            facts: recommendationFacts,
            metricSnapshot: recommendationMetricSnapshot
        )
    }

    private var displayOdds: String? {
        if let oddsDisplay = oddsDisplay?.trimmed.nilIfEmpty {
            return oddsDisplay
        }

        guard let odds else { return nil }
        let intValue = Int(odds.rounded())
        return intValue > 0 ? "+\(intValue)" : "\(intValue)"
    }

    private var normalizedSelectionFromOutcome: String? {
        guard let outcome = outcome?.trimmed.nilIfEmpty else { return nil }
        if let pointText = point?.displayValue(for: "line")?.trimmed.nilIfEmpty {
            if outcome.equalsIgnoringCase("Over") || outcome.equalsIgnoringCase("Under") {
                return "\(outcome.capitalized) \(pointText)".trimmed
            }

            if outcome.range(of: #"\bover\b|\bunder\b"#, options: [.regularExpression, .caseInsensitive]) != nil {
                return outcome.contains(pointText) ? outcome : "\(outcome) \(pointText)"
            }
        }

        return outcome
    }

    private func displaySelection(from selection: String, record: [String: JSONValue]?) -> String {
        let marketTitle = marketLabel?.trimmed.nilIfEmpty
            ?? market?.cardFriendlyTitle.nilIfEmpty
        let baseSelection = selection

        guard let marketTitle, let record, !baseSelection.hasStandaloneBetSubject(market: marketTitle) else {
            return baseSelection
        }

        if let playerName = record.playerDisplayName {
            if baseSelection.equalsIgnoringCase("Yes") {
                return playerName.cleanSentenceSpacing.trimmed
            }

            if baseSelection.equalsIgnoringCase("No") {
                return "No \(playerName)".cleanSentenceSpacing.trimmed
            }

            if !baseSelection.caseInsensitiveTrimmed.localizedCaseInsensitiveContains(playerName.caseInsensitiveTrimmed) {
                return "\(playerName) \(baseSelection)".cleanSentenceSpacing.trimmed
            }
        }

        if let teamName = record.teamDisplayName,
           !baseSelection.caseInsensitiveTrimmed.localizedCaseInsensitiveContains(teamName.caseInsensitiveTrimmed),
           marketTitle == "Moneyline" || marketTitle == "Spread" || marketTitle == "Total" {
            return "\(teamName) \(baseSelection)".cleanSentenceSpacing.trimmed
        }

        return baseSelection
    }

    private var recommendationFacts: [AssistantPresentation.Fact] {
        [
            sourceFact,
            fact(label: "Edge", value: metrics?.edgePct?.percentText, kind: .edge),
            fact(label: "EV", value: metrics?.evPct?.percentText, kind: .ev),
            fact(label: "Unit EV", value: metrics?.ev?.moneyTextWithDollar),
            fact(label: "Profit", value: metrics?.profitPct?.percentText),
            fact(label: "Guaranteed", value: metrics?.guaranteedProfit?.moneyTextWithDollar),
            fact(label: "Implied", value: metrics?.impliedProb?.percentText, kind: .implied),
            fact(label: "Model", value: metrics?.modelProb?.percentText, kind: .model)
        ]
        .compactMap { $0 }
    }

    private var recommendationMetricSnapshot: AssistantPresentation.MetricSnapshot? {
        let snapshot = AssistantPresentation.MetricSnapshot(
            edgePct: metrics?.edgePct,
            evPct: metrics?.evPct,
            impliedProb: metrics?.impliedProb,
            modelProb: metrics?.modelProb
        )

        if snapshot.edgePct == nil,
           snapshot.evPct == nil,
           snapshot.impliedProb == nil,
           snapshot.modelProb == nil {
            return nil
        }

        return snapshot
    }

    private var sourceFact: AssistantPresentation.Fact? {
        let label = sourceType?.readableLabel.nilIfEmpty ?? "Book"
        let value = bookmakerName?.trimmed.nilIfEmpty
        return fact(label: label, value: value)
    }

    private func fact(label: String, value: String?, kind: AssistantPresentation.MetricKind? = nil) -> AssistantPresentation.Fact? {
        guard let value, !value.trimmed.isEmpty else { return nil }
        return AssistantPresentation.Fact(label: label, value: value, kind: kind)
    }
}

private extension MoneyLineAIData.PresentationInfo.RecommendationInfo.EventInfo {
    var resolvedEvent: PresentationResolvedEvent? {
        let matchup = matchup?.cardFriendlyMatchup.nilIfEmpty
        let startTime = startTime?.iso8601Date

        if matchup == nil, startTime == nil {
            return nil
        }

        return PresentationResolvedEvent(matchup: matchup, startTime: startTime)
    }
}

private extension AssistantPresentation.Recommendation {
    var displayDedupKey: String {
        [
            selection.caseInsensitiveTrimmed,
            marketLabel?.caseInsensitiveTrimmed ?? "",
            oddsDisplay?.caseInsensitiveTrimmed ?? "",
            bookmakerName?.caseInsensitiveTrimmed ?? ""
        ]
        .joined(separator: "|")
    }
}

private extension Dictionary where Key == String, Value == JSONValue {
    var playerDisplayName: String? {
        firstString(for: ["description", "playerName", "player", "athleteName", "participantName", "name"])?.trimmed.nilIfEmpty
    }

    var teamDisplayName: String? {
        firstString(for: ["teamName", "team", "outcome"])?.trimmed.nilIfEmpty
    }
}

private enum SportsGPTAnswerFormatter {
    struct FormattedResponse {
        let text: String
        let presentation: AssistantPresentation?
    }

    static func format(_ rawAnswer: String) -> FormattedResponse {
        let normalized = rawAnswer
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if normalized.contains("**") || normalized.contains("\n- ") || normalized.range(of: #"\n\d+\."#, options: .regularExpression) != nil {
            return FormattedResponse(text: normalized, presentation: nil)
        }

        return FormattedResponse(
            text: normalized.cleanSentenceSpacing,
            presentation: nil
        )
    }
}

extension String {
    func components(separatedBy expression: NSRegularExpression) -> [String] {
        let nsRange = NSRange(startIndex..<endIndex, in: self)
        let matches = expression.matches(in: self, range: nsRange)

        guard !matches.isEmpty else {
            return [self]
        }

        var components: [String] = []
        var currentLocation = startIndex

        for match in matches {
            guard let range = Range(match.range, in: self) else { continue }
            components.append(String(self[currentLocation..<range.lowerBound]))
            currentLocation = range.upperBound
        }

        components.append(String(self[currentLocation..<endIndex]))
        return components
    }
}

enum JSONValue: Decodable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self = .null
        } else if let bool = try? container.decode(Bool.self) {
            self = .bool(bool)
        } else if let number = try? container.decode(Double.self) {
            self = .number(number)
        } else if let string = try? container.decode(String.self) {
            self = .string(string)
        } else if let array = try? container.decode([JSONValue].self) {
            self = .array(array)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    var stringValue: String? {
        switch self {
        case .string(let value):
            return value
        case .number(let value):
            if value.rounded() == value {
                return String(Int(value))
            }
            return String(format: "%.2f", value)
        case .bool(let value):
            return value ? "Yes" : "No"
        case .array(let values):
            let compact = values.compactMap(\.stringValue)
            return compact.isEmpty ? nil : compact.joined(separator: ", ")
        case .object:
            return nil
        case .null:
            return nil
        }
    }
}

private extension DisplayRecordCard {
    init?(from object: [String: JSONValue]) {
        let title = object.cardTitle
        let subtitle = object.cardSubtitle(title: title)
        let keyFacts = object.keyFacts(title: title, subtitle: subtitle)
        let details = object.detailItems

        guard title != nil || subtitle != nil || !keyFacts.isEmpty || !details.isEmpty else {
            return nil
        }

        self.init(title: title, subtitle: subtitle, keyFacts: keyFacts, details: details)
    }
}

private extension Dictionary where Key == String, Value == JSONValue {
    var recordTypeLowercased: String {
        self["recordType"]?.stringValue?.lowercased() ?? ""
    }

    func firstString(for keys: [String]) -> String? {
        for key in keys {
            if let value = self[key]?.stringValue, !value.isEmpty {
                return value
            }
        }

        return nil
    }

    func keyFacts(title: String?, subtitle: String?) -> [DisplayRecordCard.Fact] {
        let pairs: [(String, String)] = [
            ("guaranteedprofit", "Guaranteed Profit"),
            ("ev", "EV"),
            ("evpct", "EV"),
            ("expectedValue", "Expected Value"),
            ("odds", "Odds"),
            ("bestOdds", "Best Odds"),
            ("line", "Line"),
            ("sportsbook", "Book"),
            ("bookmaker", "Book"),
            ("bookmakerName", "Book")
        ]

        return pairs.compactMap { key, label in
            guard let value = self[key]?.displayValue(for: key) else { return nil }
            if label == "Book" {
                let normalizedValue = value.caseInsensitiveTrimmed
                if normalizedValue == title?.caseInsensitiveTrimmed || normalizedValue == subtitle?.caseInsensitiveTrimmed {
                    return nil
                }
            }
            return DisplayRecordCard.Fact(
                label: label,
                value: value,
                style: label == "Book" ? .book : (label.contains("EV") || label.contains("Profit") ? .accent : .secondary)
            )
        }
        .uniqued(by: { "\($0.label)-\($0.value)-\($0.style.rawValue)" })
        .prefix(4)
        .map { $0 }
    }

    var detailItems: [DisplayRecordCard.Detail] {
        var details: [DisplayRecordCard.Detail] = []

        if let game = firstString(for: ["eventName", "matchup", "game"])?.cardFriendlyMatchup {
            details.append(DisplayRecordCard.Detail(label: "Game", value: game))
        }

        if let pick = marketSummary {
            details.append(DisplayRecordCard.Detail(label: "Pick", value: pick))
        }

        let preferredDetails: [(String, String)] = [
            ("selection", "Pick"),
            ("description", "Player"),
            ("league", "League"),
            ("sport", "Sport"),
            ("starttime", "Start"),
            ("calculatedat", "Updated")
        ]

        details.append(contentsOf: preferredDetails.compactMap { key, label in
            guard let value = self[key]?.displayValue(for: key), !value.isEmpty else { return nil }
            return DisplayRecordCard.Detail(label: label, value: value)
        })

        return details
        .uniqued(by: { "\($0.label)-\($0.value)" })
        .prefix(3)
        .map { $0 }
    }

    var cardTitle: String? {
        let rawTitle = firstString(for: [
            "market", "marketType", "betName", "label", "title", "eventName", "matchup", "game"
        ])

        if let rawTitle, !rawTitle.isEmpty {
            let normalized = rawTitle.cardFriendlyTitle
            if !normalized.isEmpty { return normalized }
        }

        if let outcome = self["outcome"]?.displayValue(for: "outcome"), !outcome.isEmpty {
            return outcome.cardFriendlyTitle
        }

        return nil
    }

    func cardSubtitle(title: String?) -> String? {
        let game = firstString(for: ["eventName", "matchup", "game"])?.cardFriendlyMatchup
        if let game, game.caseInsensitiveTrimmed != title?.caseInsensitiveTrimmed {
            return game
        }

        let rawSubtitle = firstString(for: [
            "description", "selection", "bookmakerName", "bookmaker", "sportsbook", "league", "sport"
        ])
        guard let rawSubtitle, !rawSubtitle.isEmpty else { return nil }
        let cleaned = rawSubtitle.replacingOccurrences(of: "_", with: " ").trimmed
        return cleaned == title ? nil : cleaned
    }

    var marketSummary: String? {
        let outcome = self["outcome"]?.displayValue(for: "outcome")?.trimmed
        let line = self["line"]?.displayValue(for: "line")?.trimmed
        let market = firstString(for: ["market", "marketType", "betName"])?.cardFriendlyTitle

        if let outcome, let line, let market {
            if outcome.range(of: #"\bover\b|\bunder\b"#, options: [.regularExpression, .caseInsensitive]) != nil {
                return "\(outcome.cardFriendlyOutcome) \(line) \(market.lowercased())"
            }
        }

        if let outcome, let line {
            return "\(outcome.cardFriendlyOutcome) \(line)"
        }

        if let outcome {
            return outcome.cardFriendlyOutcome
        }

        return nil
    }

    func metricValue(_ key: String) -> String? {
        if let direct = self[key]?.displayValue(for: key) {
            return direct
        }

        return self["metrics"]?.objectValue?[key]?.displayValue(for: key)
    }

    var displayPriorityScore: Double {
        switch recordTypeLowercased {
        case "arbitrage_bet":
            return metricValue("profitPct")?.numericSubstring ?? self["profitPct"]?.numericValue ?? 0
        case "ev_bet":
            return metricValue("evPct")?.numericSubstring ?? self["evPct"]?.numericValue ?? 0
        case "best_bet":
            return abs(self["bestOdds"]?.numericValue ?? self["odds"]?.numericValue ?? 0)
        default:
            return metricValue("score")?.numericSubstring ?? 0
        }
    }

    var displayDedupKey: String {
        [
            recordTypeLowercased,
            firstString(for: ["eventId", "eventName", "matchup"]) ?? "",
            resolvedPickText ?? "",
            firstString(for: ["bookmakerId", "bookmakerName"]) ?? ""
        ].joined(separator: "|")
    }

    func displayContextSubtitle(fallbackEventName: String?) -> String? {
        firstString(for: ["eventName", "matchup", "game"])?.cardFriendlyMatchup ?? fallbackEventName
    }

    var marketPickNoun: String {
        let market = firstString(for: ["market", "marketType", "betName"])?.lowercased() ?? ""

        if market.contains("moneyline") { return "Moneyline" }
        if market.contains("assists") { return market.contains("q1") ? "1Q Assists" : "Assists" }
        if market.contains("rebounds") { return market.contains("q1") ? "1Q Rebounds" : "Rebounds" }
        if market.contains("points") { return market.contains("q1") ? "1Q Points" : "Points" }
        if market.contains("hits") { return "Hits" }
        if market.contains("threes") { return "Threes" }
        if market.contains("steals") { return "Steals" }
        if market.contains("blocks") { return "Blocks" }
        if market.contains("turnovers") { return "Turnovers" }
        if market.contains("field_goals") || market.contains("field goals") { return "Field Goals" }
        if market.contains("fantasy_points") || market.contains("fantasy points") { return "Fantasy Points" }
        return firstString(for: ["market", "marketType", "betName"])?.cardFriendlyTitle ?? "Bet"
    }

    var resolvedPickText: String? {
        guard recordTypeLowercased != "arbitrage_bet" else { return nil }

        if let selection = firstString(for: ["selection"])?.normalizedBetSelection(marketNoun: marketPickNoun), !selection.contains(" vs ") {
            return selection
        }

        guard let outcome = firstString(for: ["outcome"])?.trimmed, !outcome.contains(" vs ") else {
            return nil
        }

        let line = self["point"]?.displayValue(for: "line") ?? self["line"]?.displayValue(for: "line")
        let description = firstString(for: ["description"])?.trimmed

        if marketPickNoun == "Moneyline" {
            return "\(outcome.cleanedTeamName) Moneyline"
        }

        if outcome.equalsIgnoringCase("Over") || outcome.equalsIgnoringCase("Under") {
            if let description, let line {
                return "\(description) \(outcome.capitalized) \(line) \(marketPickNoun)".cleanSentenceSpacing.trimmed
            }
            if let line {
                return "\(outcome.capitalized) \(line) \(marketPickNoun)".cleanSentenceSpacing.trimmed
            }
        }

        if let line, outcome.range(of: #"\bover\b|\bunder\b"#, options: [.regularExpression, .caseInsensitive]) != nil {
            let combined = outcome.contains(line) ? outcome : "\(outcome) \(line)"
            return combined.normalizedBetSelection(marketNoun: marketPickNoun)
        }

        return outcome.normalizedBetSelection(marketNoun: marketPickNoun)
    }

    var arbitrageLegs: [String] {
        guard let legs = self["legs"]?.arrayValue else { return [] }

        return legs.compactMap { value in
            guard let leg = value.objectValue else { return nil }
            guard let selection = leg.firstString(for: ["selection"])?.normalizedBetSelection(marketNoun: marketPickNoun) else { return nil }
            let book = leg.firstString(for: ["bookmakerName"]) ?? "Book"
            let odds = leg["odds"]?.displayValue(for: "odds") ?? ""
            return "\(selection) at \(book) \(odds)".trimmed
        }
    }

    var arbitrageLegSummary: String? {
        let legs = arbitrageLegs
        guard !legs.isEmpty else { return nil }
        return legs.joined(separator: " • ")
    }
}

private extension JSONValue {
    func displayValue(for key: String) -> String? {
        switch key.lowercased() {
        case "calculatedat", "starttime":
            guard case .string(let value) = self else { return stringValue }
            return value.shortISODateTime
        case "guaranteedprofit":
            if let number = numericValue {
                return "$" + number.moneyText
            }
            return stringValue
        case "ev", "evpct":
            if let number = numericValue {
                return number.percentText
            }
            return stringValue
        case "odds", "bestodds", "line":
            if key.lowercased() == "line" {
                return stringValue
            }
            if let number = numericValue {
                let intValue = Int(number)
                return intValue > 0 ? "+\(intValue)" : "\(intValue)"
            }
            if let string = stringValue {
                return string.hasPrefix("+") || string.hasPrefix("-") ? string : string
            }
            return nil
        case "outcome":
            return stringValue?.cardFriendlyOutcome
        default:
            return stringValue
        }
    }

    var numericValue: Double? {
        switch self {
        case .number(let value):
            return value
        case .string(let value):
            return Double(value)
        default:
            return nil
        }
    }

    var objectValue: [String: JSONValue]? {
        if case .object(let value) = self {
            return value
        }
        return nil
    }

    var arrayValue: [JSONValue]? {
        if case .array(let value) = self {
            return value
        }
        return nil
    }
}

extension String {
    var trimmed: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var nilIfEmpty: String? {
        trimmed.isEmpty ? nil : trimmed
    }

    var cleanSentenceSpacing: String {
        replacingOccurrences(of: #"([a-z0-9%\.])([A-Z])"#, with: "$1 $2", options: .regularExpression)
            .replacingOccurrences(of: #"\s{2,}"#, with: " ", options: .regularExpression)
            .trimmed
    }

    var sentenceCasedLead: String {
        let value = trimmed
        guard let first = value.first else { return value }
        return first.uppercased() + value.dropFirst()
    }

    var readableLabel: String {
        replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "-", with: " ")
            .split(whereSeparator: \.isWhitespace)
            .map { $0.capitalized }
            .joined(separator: " ")
    }

    var cardFriendlyTitle: String {
        let normalized = replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "-", with: " ")
            .trimmed

        let mappings: [(String, String)] = [
            ("moneyline", "Moneyline"),
            ("batter hits", "Batter Hits"),
            ("player points q1", "1Q Player Points"),
            ("player assists q1", "1Q Player Assists"),
            ("player rebounds q1", "1Q Player Rebounds"),
            ("player points", "Player Points"),
            ("player assists", "Player Assists"),
            ("player rebounds", "Player Rebounds")
        ]

        if let mapped = mappings.first(where: { normalized.caseInsensitiveCompare($0.0) == .orderedSame })?.1 {
            return mapped
        }

        return normalized.readableLabel
    }

    var cardFriendlyOutcome: String {
        replacingOccurrences(of: " vs ", with: " or ")
            .replacingOccurrences(of: "\\s{2,}", with: " ", options: .regularExpression)
            .trimmed
    }

    func normalizedBetSelection(marketNoun: String) -> String {
        var value = self
            .replacingOccurrences(of: #"(\\b\\d+(?:\\.\\d+)?)\\s+\\1$"#, with: "$1", options: .regularExpression)
            .replacingOccurrences(of: "\\s{2,}", with: " ", options: .regularExpression)
            .trimmed

        if marketNoun == "Moneyline" {
            if !value.localizedCaseInsensitiveContains("moneyline") {
                value += " Moneyline"
            }
            return value.cleanSentenceSpacing.trimmed
        }

        if !value.localizedCaseInsensitiveContains(marketNoun),
           value.range(of: #"\bover\b|\bunder\b"#, options: [.regularExpression, .caseInsensitive]) != nil {
            value += " \(marketNoun)"
        }

        return value.cleanSentenceSpacing.trimmed
    }

    func hasStandaloneBetSubject(market: String?) -> Bool {
        let stripped = self
            .replacingOccurrences(of: #"[+\-]?\d+(?:\.\d+)?"#, with: " ", options: .regularExpression)
            .replacingOccurrences(
                of: #"\b(over|under|moneyline|spread|total|player|assists?|rebounds?|points?|hits?|threes?|steals?|blocks?|turnovers?|first|quarter|half|game|line|alternate|alt)\b"#,
                with: " ",
                options: [.regularExpression, .caseInsensitive]
            )
            .replacingOccurrences(of: #"[^\p{L}\p{N}\s]"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\s{2,}", with: " ", options: .regularExpression)
            .trimmed

        if stripped.split(whereSeparator: \.isWhitespace).count >= 2 {
            return true
        }

        guard let market else { return false }
        guard market.lowercased().contains("moneyline") else { return false }
        return !stripped.isEmpty
    }

    var needsEventContext: Bool {
        let lowered = lowercased()
        return lowered.contains("player")
            || lowered.contains("batter")
            || lowered.contains("goal scorer")
            || lowered.contains("shots")
            || lowered.contains("hits")
            || lowered.contains("assists")
            || lowered.contains("rebounds")
            || lowered.contains("points")
            || lowered.contains("goals")
    }

    var cardFriendlyMatchup: String {
        replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "\\s{2,}", with: " ", options: .regularExpression)
            .trimmed
    }

    var inferredMatchup: String? {
        let patterns = [
            #"between ([A-Z][A-Za-z0-9&.'\- ]+?) and ([A-Z][A-Za-z0-9&.'\- ]+?)(?:[:\.\n]| game\b)"#,
            #"for the ([A-Z][A-Za-z0-9&.'\- ]+?) vs ([A-Z][A-Za-z0-9&.'\- ]+?)(?:[:\.\n]| game\b)"#
        ]

        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { continue }
            let range = NSRange(startIndex..<endIndex, in: self)
            guard let match = regex.firstMatch(in: self, range: range),
                  match.numberOfRanges >= 3,
                  let firstRange = Range(match.range(at: 1), in: self),
                  let secondRange = Range(match.range(at: 2), in: self) else {
                continue
            }

            let firstTeam = String(self[firstRange]).trimmed
            let secondTeam = String(self[secondRange]).trimmed

            if !firstTeam.isEmpty && !secondTeam.isEmpty {
                return "\(firstTeam) vs \(secondTeam)"
            }
        }

        return nil
    }

    var shortISODateTime: String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let fallbackParser = ISO8601DateFormatter()

        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d, h:mm a"
        formatter.locale = Locale(identifier: "en_US_POSIX")

        if let date = parser.date(from: self) ?? fallbackParser.date(from: self) {
            return formatter.string(from: date)
        }

        return self
    }

    var cleanedTeamName: String {
        replacingOccurrences(of: " \(#"/"#)", with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var caseInsensitiveTrimmed: String {
        trimmed.lowercased()
    }

    var numericSubstring: Double? {
        guard let match = range(of: #"-?\d+(?:\.\d+)?"#, options: .regularExpression) else { return nil }
        return Double(String(self[match]))
    }

    func equalsIgnoringCase(_ other: String) -> Bool {
        caseInsensitiveCompare(other) == .orderedSame
    }
}

private extension Array where Element: Hashable {
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}

private extension Array {
    func removingDuplicates<T: Hashable>(by keyPath: KeyPath<Element, T>) -> [Element] {
        var seen = Set<T>()
        return filter { seen.insert($0[keyPath: keyPath]).inserted }
    }

    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

private extension Array {
    func uniqued<T: Hashable>(by keyPath: (Element) -> T) -> [Element] {
        var seen = Set<T>()
        return filter { seen.insert(keyPath($0)).inserted }
    }
}

private extension Double {
    var percentText: String {
        if self >= 1 {
            return String(format: "%.2f%%", self)
        } else {
            return String(format: "%.2f%%", self * 100)
        }
    }

    var moneyText: String {
        if rounded() == self {
            return String(Int(self))
        }
        return String(format: "%.2f", self)
    }

    var moneyTextWithDollar: String {
        "$" + moneyText
    }
}

extension Date {
    var shortMonthDayText: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter.string(from: self)
    }

    var sportsbookEasternTimeText: String {
        let easternTimeZone = TimeZone(identifier: "America/New_York")

        let dateFormatter = DateFormatter()
        dateFormatter.locale = Locale.autoupdatingCurrent
        dateFormatter.timeZone = easternTimeZone
        dateFormatter.setLocalizedDateFormatFromTemplate("EEE MMM d")

        let timeFormatter = DateFormatter()
        timeFormatter.locale = Locale.autoupdatingCurrent
        timeFormatter.timeZone = easternTimeZone
        timeFormatter.setLocalizedDateFormatFromTemplate("h:mm a")

        return "\(dateFormatter.string(from: self)) at \(timeFormatter.string(from: self)) ET"
    }
}

private extension String {
    var iso8601Date: Date? {
        let fractionalFormatter = ISO8601DateFormatter()
        fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        if let date = fractionalFormatter.date(from: self) {
            return date
        }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: self)
    }
}
