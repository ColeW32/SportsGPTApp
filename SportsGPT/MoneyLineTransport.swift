//
//  MoneyLineTransport.swift
//  SportsGPT
//
//  Created by Codex on 4/12/26.
//

import Foundation

protocol MoneyLineTransport {
    func sendChat(payload: MoneyLineChatRequest) async throws -> MoneyLineAIData
    func fetchBestBets(limit: Int, bookmaker: String?) async throws -> [BestBetEvent]
    func fetchEventBestBets(eventId: String, bookmaker: String?) async throws -> BestBetEvent
}

enum MoneyLineTransportFactory {
    static func makeDefault(session: URLSession = .shared) -> any MoneyLineTransport {
        let configuration = AppServicesConfiguration.shared

        if configuration.moneyLineTransportMode == .firebaseCallable,
           configuration.hasGoogleServiceInfo {
            return FirebaseMoneyLineTransport(configuration: configuration)
        }

        return DirectMoneyLineTransport(session: session, configuration: configuration)
    }
}

enum MoneyLineTransportError: LocalizedError {
    case missingDirectAPIKey
    case firebaseNotConfigured
    case callableResponseInvalid

    var errorDescription: String? {
        switch self {
        case .missingDirectAPIKey:
            return "MoneyLine is not configured yet. Add a Firebase proxy or a local API key."
        case .firebaseNotConfigured:
            return "Firebase is not configured yet, so the MoneyLine proxy is unavailable."
        case .callableResponseInvalid:
            return "The Firebase MoneyLine proxy returned an invalid response."
        }
    }
}

struct DirectMoneyLineTransport: MoneyLineTransport {
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let configuration: AppServicesConfiguration

    init(session: URLSession = .shared, configuration: AppServicesConfiguration = .shared) {
        self.session = session
        self.configuration = configuration
    }

    func sendChat(payload: MoneyLineChatRequest) async throws -> MoneyLineAIData {
        guard let url = URL(string: "https://mlapi.bet/v1/ai/chat") else {
            throw SportsGPTError.invalidURL
        }

        var request = try authorizedRequest(url: url, method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(payload)

        let decoded: MoneyLineAIResponse = try await perform(request)
        guard let data = decoded.data else {
            throw SportsGPTError.emptyResponse
        }

        return data
    }

    func fetchBestBets(limit: Int, bookmaker: String?) async throws -> [BestBetEvent] {
        guard var components = URLComponents(string: "https://mlapi.bet/v1/best-bets") else {
            throw SportsGPTError.invalidURL
        }

        var queryItems = [URLQueryItem(name: "limit", value: String(limit))]
        if let bookmaker {
            queryItems.append(URLQueryItem(name: "bookmaker", value: bookmaker))
        }
        components.queryItems = queryItems

        guard let url = components.url else {
            throw SportsGPTError.invalidURL
        }

        let request = try authorizedRequest(url: url, method: "GET")
        let decoded: BestBetsResponse = try await perform(request)
        return decoded.data ?? []
    }

    func fetchEventBestBets(eventId: String, bookmaker: String?) async throws -> BestBetEvent {
        guard var components = URLComponents(string: "https://mlapi.bet/v1/events/\(eventId)/best-bets") else {
            throw SportsGPTError.invalidURL
        }

        if let bookmaker {
            components.queryItems = [URLQueryItem(name: "bookmaker", value: bookmaker)]
        }

        guard let url = components.url else {
            throw SportsGPTError.invalidURL
        }

        let request = try authorizedRequest(url: url, method: "GET")
        let decoded: EventBestBetsResponse = try await perform(request)

        guard let data = decoded.data else {
            throw SportsGPTError.emptyResponse
        }

        return data
    }

    private func authorizedRequest(url: URL, method: String) throws -> URLRequest {
        guard let apiKey = configuration.moneyLineDirectAPIKey else {
            throw MoneyLineTransportError.missingDirectAPIKey
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.timeoutInterval = 30
        return request
    }

    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw SportsGPTError.invalidResponse
        }

        let decoded = try decoder.decode(T.self, from: data)

        if let moneyLineResponse = decoded as? MoneyLineAIResponse {
            guard 200..<300 ~= httpResponse.statusCode, moneyLineResponse.success else {
                let message = moneyLineResponse.error?.message ?? "The request failed with status \(httpResponse.statusCode)."
                throw SportsGPTError.server(message)
            }
        } else if let bestBetsResponse = decoded as? BestBetsResponse {
            guard 200..<300 ~= httpResponse.statusCode, bestBetsResponse.success else {
                let message = bestBetsResponse.error?.message ?? "The best-bets request failed with status \(httpResponse.statusCode)."
                throw SportsGPTError.server(message)
            }
        } else if let eventResponse = decoded as? EventBestBetsResponse {
            guard 200..<300 ~= httpResponse.statusCode, eventResponse.success else {
                let message = eventResponse.error?.message ?? "The event best-bets request failed with status \(httpResponse.statusCode)."
                throw SportsGPTError.server(message)
            }
        }

        return decoded
    }
}

struct FirebaseMoneyLineTransport: MoneyLineTransport {
    private let proxyClient: FirebaseProxyClient

    init(
        session: URLSession = .shared,
        configuration: AppServicesConfiguration = .shared
    ) {
        self.proxyClient = FirebaseProxyClient(session: session, configuration: configuration)
    }

    func sendChat(payload: MoneyLineChatRequest) async throws -> MoneyLineAIData {
        let response: MoneyLineAIResponse = try await proxyClient.call(
            operation: "aiChat",
            payload: ["body": try FirebaseProxyClient.jsonObject(from: payload)]
        )

        guard let data = response.data else {
            throw SportsGPTError.emptyResponse
        }

        return data
    }

    func fetchBestBets(limit: Int, bookmaker: String?) async throws -> [BestBetEvent] {
        var payload: [String: Any] = ["limit": limit]
        if let bookmaker {
            payload["bookmaker"] = bookmaker
        }

        let response: BestBetsResponse = try await proxyClient.call(operation: "bestBets", payload: payload)

        return response.data ?? []
    }

    func fetchEventBestBets(eventId: String, bookmaker: String?) async throws -> BestBetEvent {
        var payload: [String: Any] = ["eventId": eventId]
        if let bookmaker {
            payload["bookmaker"] = bookmaker
        }

        let response: EventBestBetsResponse = try await proxyClient.call(operation: "eventBestBets", payload: payload)

        guard let data = response.data else {
            throw SportsGPTError.emptyResponse
        }

        return data
    }
}

private struct FirebaseProxyClient {
    private struct ProxyErrorEnvelope: Decodable {
        struct ErrorPayload: Decodable {
            let message: String?
        }

        let error: ErrorPayload?
        let message: String?
    }

    private let session: URLSession
    private let configuration: AppServicesConfiguration
    private let decoder = JSONDecoder()

    init(session: URLSession, configuration: AppServicesConfiguration) {
        self.session = session
        self.configuration = configuration
    }

    func call<T: Decodable>(operation: String, payload: [String: Any]) async throws -> T {
        guard let requestURL = proxyURL else {
            throw MoneyLineTransportError.firebaseNotConfigured
        }

        var requestPayload = payload
        requestPayload["operation"] = operation
        let requestBody = try JSONSerialization.data(withJSONObject: requestPayload)
        var request = URLRequest(url: requestURL)
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = requestBody

        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw SportsGPTError.invalidResponse
            }

            guard 200..<300 ~= httpResponse.statusCode else {
                let envelope = try? decoder.decode(ProxyErrorEnvelope.self, from: data)
                let message = envelope?.error?.message
                    ?? envelope?.message
                    ?? HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode)
                throw SportsGPTError.server(message)
            }

            return try decoder.decode(T.self, from: data)
        } catch {
            throw mapProxyError(error)
        }
    }

    static func jsonObject<T: Encodable>(from value: T) throws -> Any {
        let data = try JSONEncoder().encode(value)
        return try JSONSerialization.jsonObject(with: data)
    }

    private var proxyURL: URL? {
        guard let projectID = configuration.firebaseProjectID else {
            return nil
        }

        return URL(
            string: "https://\(configuration.firebaseFunctionsRegion)-\(projectID).cloudfunctions.net/\(configuration.firebaseMoneyLineProxyFunctionName)"
        )
    }

    private func mapProxyError(_ error: Error) -> Error {
        let nsError = error as NSError

        if nsError.localizedDescription.localizedCaseInsensitiveContains("permission denied") {
            return SportsGPTError.server(
                "SportsGPT couldn't reach the MoneyLine proxy. Please make sure you're on the latest build and try again."
            )
        }

        return error
    }
}
