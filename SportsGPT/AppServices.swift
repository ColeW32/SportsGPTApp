//
//  AppServices.swift
//  SportsGPT
//
//  Created by Codex on 4/12/26.
//

import Foundation

enum MoneyLineTransportMode: String {
    case direct
    case firebaseCallable
}

struct AppServicesConfiguration {
    private enum Keys {
        static let revenueCatPublicSDKKey = "RevenueCatPublicSDKKey"
        static let revenueCatEntitlementID = "RevenueCatEntitlementID"
        static let revenueCatMonthlyProductID = "RevenueCatMonthlyProductID"
        static let revenueCatAnnualProductID = "RevenueCatAnnualProductID"
        static let revenueCatLifetimeProductID = "RevenueCatLifetimeProductID"
        static let moneyLineTransportMode = "MoneyLineTransportMode"
        static let moneyLineDirectAPIKey = "MoneyLineDirectAPIKey"
        static let firebaseFunctionsRegion = "FirebaseFunctionsRegion"
        static let firebaseMoneyLineProxyFunctionName = "FirebaseMoneyLineProxyFunctionName"
        static let firebaseAppCheckDebugToken = "FirebaseAppCheckDebugToken"
    }

    static let shared = load()

    let revenueCatPublicSDKKey: String?
    let revenueCatEntitlementID: String
    let revenueCatMonthlyProductID: String?
    let revenueCatAnnualProductID: String?
    let revenueCatLifetimeProductID: String?
    let moneyLineTransportMode: MoneyLineTransportMode
    let moneyLineDirectAPIKey: String?
    let firebaseFunctionsRegion: String
    let firebaseMoneyLineProxyFunctionName: String
    let firebaseProjectID: String?
    let firebaseAppCheckDebugToken: String?

    var isRevenueCatConfigured: Bool {
        revenueCatPublicSDKKey != nil
    }

    func revenueCatProductID(for planKind: SubscriptionPlanKind) -> String? {
        switch planKind {
        case .yearly:
            return revenueCatAnnualProductID
        case .lifetime:
            return revenueCatLifetimeProductID
        case .monthly:
            return revenueCatMonthlyProductID
        }
    }

    var hasDirectMoneyLineKey: Bool {
        moneyLineDirectAPIKey != nil
    }

    var hasGoogleServiceInfo: Bool {
        Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil
    }

    private static func load(bundle: Bundle = .main) -> AppServicesConfiguration {
        let environment = ProcessInfo.processInfo.environment
        let bundledValues = dictionary(named: "AppServices", bundle: bundle) ?? [:]
        let localOverrides = dictionary(named: "AppServices.local", bundle: bundle) ?? [:]
        let values = bundledValues.merging(localOverrides) { _, override in override }

        return AppServicesConfiguration(
            revenueCatPublicSDKKey: environment["SPORTSGPT_REVENUECAT_PUBLIC_SDK_KEY"]?.trimmedNilIfEmpty
                ?? values[Keys.revenueCatPublicSDKKey]?.trimmedNilIfEmpty,
            revenueCatEntitlementID: values[Keys.revenueCatEntitlementID]?.trimmedNilIfEmpty ?? "SportsGPT Pro",
            revenueCatMonthlyProductID: environment["SPORTSGPT_REVENUECAT_MONTHLY_PRODUCT_ID"]?.trimmedNilIfEmpty
                ?? values[Keys.revenueCatMonthlyProductID]?.trimmedNilIfEmpty,
            revenueCatAnnualProductID: environment["SPORTSGPT_REVENUECAT_ANNUAL_PRODUCT_ID"]?.trimmedNilIfEmpty
                ?? values[Keys.revenueCatAnnualProductID]?.trimmedNilIfEmpty,
            revenueCatLifetimeProductID: environment["SPORTSGPT_REVENUECAT_LIFETIME_PRODUCT_ID"]?.trimmedNilIfEmpty
                ?? values[Keys.revenueCatLifetimeProductID]?.trimmedNilIfEmpty,
            moneyLineTransportMode: MoneyLineTransportMode(
                rawValue: environment["SPORTSGPT_MONEYLINE_TRANSPORT_MODE"]?.trimmedNilIfEmpty
                    ?? values[Keys.moneyLineTransportMode]?.trimmedNilIfEmpty
                    ?? ""
            ) ?? .firebaseCallable,
            moneyLineDirectAPIKey: environment["SPORTSGPT_MONEYLINE_DIRECT_API_KEY"]?.trimmedNilIfEmpty
                ?? values[Keys.moneyLineDirectAPIKey]?.trimmedNilIfEmpty,
            firebaseFunctionsRegion: environment["SPORTSGPT_FIREBASE_FUNCTIONS_REGION"]?.trimmedNilIfEmpty
                ?? values[Keys.firebaseFunctionsRegion]?.trimmedNilIfEmpty
                ?? "us-central1",
            firebaseMoneyLineProxyFunctionName: environment["SPORTSGPT_FIREBASE_FUNCTION_NAME"]?.trimmedNilIfEmpty
                ?? values[Keys.firebaseMoneyLineProxyFunctionName]?.trimmedNilIfEmpty
                ?? "moneylineProxy",
            firebaseProjectID: environment["SPORTSGPT_FIREBASE_PROJECT_ID"]?.trimmedNilIfEmpty
                ?? (dictionary(named: "GoogleService-Info", bundle: bundle)?["PROJECT_ID"]?.trimmedNilIfEmpty),
            firebaseAppCheckDebugToken: environment["SPORTSGPT_FIREBASE_APPCHECK_DEBUG_TOKEN"]?.trimmedNilIfEmpty
                ?? values[Keys.firebaseAppCheckDebugToken]?.trimmedNilIfEmpty
        )
    }

    private static func dictionary(named resourceName: String, bundle: Bundle) -> [String: String]? {
        guard let url = bundle.url(forResource: resourceName, withExtension: "plist"),
              let data = try? Data(contentsOf: url),
              let raw = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil),
              let dictionary = raw as? [String: Any] else {
            return nil
        }

        return dictionary.reduce(into: [:]) { partialResult, pair in
            if let string = pair.value as? String {
                partialResult[pair.key] = string
            }
        }
    }
}

private extension String {
    var trimmedNilIfEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
