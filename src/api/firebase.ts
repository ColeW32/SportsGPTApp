import { firebase } from "@react-native-firebase/app-check";
import auth from "@react-native-firebase/auth";
import Purchases, { LOG_LEVEL } from "react-native-purchases";

import { REVENUECAT_IOS_API_KEY } from "./constants";

export { ENTITLEMENT_ID, REVENUECAT_IOS_API_KEY } from "./constants";

let bootstrapPromise: Promise<string> | undefined;

export function bootstrapFirebase(): Promise<string> {
  bootstrapPromise ??= doBootstrap();
  return bootstrapPromise;
}

async function doBootstrap(): Promise<string> {
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
  Purchases.configure({ apiKey: REVENUECAT_IOS_API_KEY });

  const provider = firebase.appCheck().newReactNativeFirebaseAppCheckProvider();
  provider.configure({
    apple: {
      provider: __DEV__ ? "debug" : "appAttestWithDeviceCheckFallback",
      debugToken: process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN,
    },
    android: {
      provider: "playIntegrity",
    },
  });
  await firebase.appCheck().initializeAppCheck({
    provider,
    isTokenAutoRefreshEnabled: true,
  });

  const user = auth().currentUser ?? (await auth().signInAnonymously()).user;
  await Purchases.logIn(user.uid);
  return user.uid;
}
