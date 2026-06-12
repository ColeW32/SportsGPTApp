//
//  SportsGPTTests.swift
//  SportsGPTTests
//
//  Created by Jason Schubert on 4/8/26.
//

import Foundation
import Testing
@testable import SportsGPT

struct SportsGPTTests {

    @Test func appServicesMapsRevenueCatFallbackProductIDsByPlan() {
        let configuration = AppServicesConfiguration(
            revenueCatPublicSDKKey: "appl_test",
            revenueCatEntitlementID: "SportsGPT Pro",
            revenueCatMonthlyProductID: "monthly_id",
            revenueCatAnnualProductID: "annual_id",
            revenueCatLifetimeProductID: "lifetime_id",
            moneyLineTransportMode: .firebaseCallable,
            moneyLineDirectAPIKey: nil,
            firebaseFunctionsRegion: "us-central1",
            firebaseMoneyLineProxyFunctionName: "moneylineProxyHttp",
            firebaseProjectID: nil,
            firebaseAppCheckDebugToken: nil
        )

        #expect(configuration.revenueCatProductID(for: .monthly) == "monthly_id")
        #expect(configuration.revenueCatProductID(for: .yearly) == "annual_id")
        #expect(configuration.revenueCatProductID(for: .lifetime) == "lifetime_id")
    }

    @MainActor
    @Test func subscriptionStoreMarksUserPremiumAfterSuccessfulPurchase() async throws {
        let suiteName = "SportsGPTTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let service = MockRevenueCatService(
            currentSnapshotResult: .success(.inactive),
            purchaseResult: .success(.activeSubscriber),
            restoreResult: .success(.inactive)
        )

        let store = SubscriptionStore(revenueCatService: service, userDefaults: defaults)
        store.presentPaywall()

        let yearlyPlan = try #require(store.plans.first(where: { $0.kind == .yearly }))
        let didUnlock = await store.purchase(plan: yearlyPlan)

        #expect(didUnlock)
        #expect(store.isPremium)
        #expect(!store.isPaywallPresented)

        if case .activeSubscriber = store.state {
        } else {
            Issue.record("Expected active subscriber state after a successful purchase.")
        }
    }

    @MainActor
    @Test func subscriptionStoreShowsFriendlyErrorWhenPurchaseFails() async throws {
        let suiteName = "SportsGPTTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let service = MockRevenueCatService(
            currentSnapshotResult: .success(.inactive),
            purchaseResult: .failure(RevenueCatServiceError.productUnavailable(.monthly)),
            restoreResult: .success(.inactive)
        )

        let store = SubscriptionStore(revenueCatService: service, userDefaults: defaults)
        let monthlyPlan = try #require(store.plans.first(where: { $0.kind == .monthly }))
        let didUnlock = await store.purchase(plan: monthlyPlan)

        #expect(!didUnlock)
        #expect(store.subscriptionErrorMessage == RevenueCatServiceError.productUnavailable(.monthly).errorDescription)
        #expect(!store.isPremium)
    }
}

private struct MockRevenueCatService: RevenueCatSubscriptionServicing {
    let isConfigured: Bool = true
    let currentSnapshotResult: Result<RevenueCatSubscriptionSnapshot, Error>
    let purchaseResult: Result<RevenueCatSubscriptionSnapshot, Error>
    let restoreResult: Result<RevenueCatSubscriptionSnapshot, Error>

    func currentSnapshot() async throws -> RevenueCatSubscriptionSnapshot {
        try currentSnapshotResult.get()
    }

    func purchase(planKind: SubscriptionPlanKind) async throws -> RevenueCatSubscriptionSnapshot {
        try purchaseResult.get()
    }

    func restorePurchases() async throws -> RevenueCatSubscriptionSnapshot {
        try restoreResult.get()
    }
}

private extension RevenueCatSubscriptionSnapshot {
    static let inactive = RevenueCatSubscriptionSnapshot(
        entitlementIsActive: false,
        isTrial: false,
        renewalDate: nil,
        managementURL: nil
    )

    static let activeSubscriber = RevenueCatSubscriptionSnapshot(
        entitlementIsActive: true,
        isTrial: false,
        renewalDate: Date(timeIntervalSince1970: 1_776_000_000),
        managementURL: URL(string: "https://apps.apple.com/account/subscriptions")
    )
}
