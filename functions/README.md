# SportsGPT Firebase Proxy

This function keeps the MoneyLine API key off the client.

## What it does

- Exposes one callable function: `moneylineProxy`
- Accepts three operations from the iOS app:
  - `aiChat`
  - `bestBets`
  - `eventBestBets`
- Injects the MoneyLine API key server-side
- Enforces Firebase App Check on every call

## Required setup

1. Add your Apple app to Firebase and download `GoogleService-Info.plist`.
2. Place `GoogleService-Info.plist` in the Xcode project locally.
3. Enable App Check in Firebase for the app.
4. Set the MoneyLine secret:

```bash
firebase functions:secrets:set MONEYLINE_API_KEY
```

5. Install dependencies and deploy:

```bash
cd functions
npm install
firebase deploy --only functions
```

## iOS config

The app reads `SportsGPT/Configuration/AppServices.plist`.

For production, keep:

- `MoneyLineTransportMode = firebaseCallable`
- `FirebaseFunctionsRegion = us-central1`
- `FirebaseMoneyLineProxyFunctionName = moneylineProxy`

For local development only, you can override values with scheme environment variables:

- `SPORTSGPT_REVENUECAT_PUBLIC_SDK_KEY`
- `SPORTSGPT_MONEYLINE_DIRECT_API_KEY`
- `SPORTSGPT_MONEYLINE_TRANSPORT_MODE`
- `SPORTSGPT_FIREBASE_FUNCTIONS_REGION`
- `SPORTSGPT_FIREBASE_FUNCTION_NAME`
