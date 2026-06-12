//
//  RevenueCatService.swift
//  SportsGPT
//
//  Created by Codex on 4/12/26.
//

import Foundation
import RevenueCat

struct RevenueCatSubscriptionSnapshot: Equatable {
    let entitlementIsActive: Bool
    let isTrial: Bool
    let renewalDate: Date?
    let managementURL: URL?
}

protocol RevenueCatSubscriptionServicing {
    var isConfigured: Bool { get }
    func currentSnapshot() async throws -> RevenueCatSubscriptionSnapshot
    func purchase(planKind: SubscriptionPlanKind) async throws -> RevenueCatSubscriptionSnapshot
    func restorePurchases() async throws -> RevenueCatSubscriptionSnapshot
}

enum RevenueCatServiceError: LocalizedError {
    case missingAPIKey
    case offeringsUnavailable
    case packageUnavailable(SubscriptionPlanKind)
    case productUnavailable(SubscriptionPlanKind)
    case purchaseCancelled

    var errorDescription: String? {
        switch self {
        case .missingAPIKey:
            return "RevenueCat is not configured yet."
        case .offeringsUnavailable:
            return "RevenueCat could not load offerings right now."
        case .packageUnavailable(let planKind):
            return "RevenueCat could not find the \(planKind.displayName) package in the current offering."
        case .productUnavailable(let planKind):
            return "SportsGPT could not load the App Store product for the \(planKind.displayName) plan."
        case .purchaseCancelled:
            return "Purchase cancelled."
        }
    }
}

private enum RevenueCatPurchaseTarget {
    case package(Package)
    case product(StoreProduct)
}

final class RevenueCatSubscriptionService: RevenueCatSubscriptionServicing {
    static let shared = RevenueCatSubscriptionService()

    private let configuration: AppServicesConfiguration

    init(configuration: AppServicesConfiguration = .shared) {
        self.configuration = configuration
    }

    var isConfigured: Bool {
        configuration.isRevenueCatConfigured
    }

    func currentSnapshot() async throws -> RevenueCatSubscriptionSnapshot {
        guard isConfigured else {
            throw RevenueCatServiceError.missingAPIKey
        }

        let customerInfo = try await Purchases.shared.customerInfo()
        return snapshot(from: customerInfo)
    }

    func purchase(planKind: SubscriptionPlanKind) async throws -> RevenueCatSubscriptionSnapshot {
        guard isConfigured else {
            throw RevenueCatServiceError.missingAPIKey
        }

        let target = try await fetchPurchaseTarget(for: planKind)
        let customerInfo = try await purchase(target: target)
        return snapshot(from: customerInfo)
    }

    func restorePurchases() async throws -> RevenueCatSubscriptionSnapshot {
        guard isConfigured else {
            throw RevenueCatServiceError.missingAPIKey
        }

        let customerInfo = try await Purchases.shared.restorePurchases()
        return snapshot(from: customerInfo)
    }

    private func fetchPurchaseTarget(for planKind: SubscriptionPlanKind) async throws -> RevenueCatPurchaseTarget {
        if let package = try? await fetchPackageFromOfferings(for: planKind) {
            return .package(package)
        }

        if let product = await fetchDirectProduct(for: planKind) {
            return .product(product)
        }

        if configuration.revenueCatProductID(for: planKind) == nil {
            throw RevenueCatServiceError.packageUnavailable(planKind)
        }

        throw RevenueCatServiceError.productUnavailable(planKind)
    }

    private func fetchPackageFromOfferings(for planKind: SubscriptionPlanKind) async throws -> Package {
        let offerings = try await Purchases.shared.offerings()
        guard let currentOffering = offerings.current else {
            throw RevenueCatServiceError.offeringsUnavailable
        }

        guard let package = currentOffering.availablePackages.first(where: { $0.packageType == planKind.packageType }) else {
            throw RevenueCatServiceError.packageUnavailable(planKind)
        }

        return package
    }

    private func fetchDirectProduct(for planKind: SubscriptionPlanKind) async -> StoreProduct? {
        guard let productID = configuration.revenueCatProductID(for: planKind) else {
            return nil
        }

        let products = await Purchases.shared.products([productID])
        return products.first(where: { $0.productIdentifier == productID }) ?? products.first
    }

    private func purchase(target: RevenueCatPurchaseTarget) async throws -> CustomerInfo {
        let result: PurchaseResultData

        switch target {
        case .package(let package):
            result = try await Purchases.shared.purchase(package: package)
        case .product(let product):
            result = try await Purchases.shared.purchase(product: product)
        }

        if result.userCancelled {
            throw RevenueCatServiceError.purchaseCancelled
        }

        return result.customerInfo
    }

    private func snapshot(from customerInfo: CustomerInfo) -> RevenueCatSubscriptionSnapshot {
        let entitlement = customerInfo.entitlements[configuration.revenueCatEntitlementID]

        return RevenueCatSubscriptionSnapshot(
            entitlementIsActive: entitlement?.isActive == true,
            isTrial: entitlement?.periodType == .trial,
            renewalDate: entitlement?.expirationDate,
            managementURL: customerInfo.managementURL
        )
    }
}
