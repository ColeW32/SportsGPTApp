//
//  AppBootstrap.swift
//  SportsGPT
//
//  Created by Codex on 4/12/26.
//

import FirebaseAppCheck
import FirebaseCore
import Foundation
import RevenueCat

enum AppBootstrap {
    static func configureThirdPartyServices() {
        configureFirebaseIfNeeded()
        configureRevenueCatIfNeeded()
    }

    private static func configureFirebaseIfNeeded() {
        let configuration = AppServicesConfiguration.shared
        guard configuration.hasGoogleServiceInfo, FirebaseApp.app() == nil else {
            return
        }

        AppCheck.setAppCheckProviderFactory(
            SportsGPTAppCheckProviderFactory(
                providerMode: AppCheckConfiguration.providerMode
            )
        )

#if DEBUG
        if AppCheckConfiguration.providerMode == .debug,
           let debugToken = configuration.firebaseAppCheckDebugToken {
            setenv("FIRAAppCheckDebugToken", debugToken, 1)
        }
#endif

        FirebaseApp.configure()
    }

    private static func configureRevenueCatIfNeeded() {
        let configuration = AppServicesConfiguration.shared
        guard let apiKey = configuration.revenueCatPublicSDKKey else {
            return
        }

#if DEBUG
        Purchases.logLevel = .debug
#else
        Purchases.logLevel = .info
#endif

        Purchases.configure(withAPIKey: apiKey)
    }
}

enum AppCheckConfiguration {
    enum ProviderMode {
        case debug
        case attested
    }

    static var providerMode: ProviderMode {
#if DEBUG
        #if targetEnvironment(simulator)
        return .debug
        #else
        return .attested
        #endif
#else
        return .attested
#endif
    }
}

final class SportsGPTAppCheckProviderFactory: NSObject, AppCheckProviderFactory {
    private let providerMode: AppCheckConfiguration.ProviderMode

    init(providerMode: AppCheckConfiguration.ProviderMode) {
        self.providerMode = providerMode
    }

    func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
#if DEBUG
        if providerMode == .debug {
            return AppCheckDebugProvider(app: app)
        }
#endif
        if #available(iOS 14.0, *) {
            return AppAttestProvider(app: app)
        }

        return DeviceCheckProvider(app: app)
    }
}
