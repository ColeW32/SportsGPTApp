import { firebase } from "@react-native-firebase/app-check";

// Forces a fresh App Check token. On a cold install the App Attest hardware-key
// handshake can take a moment to settle; forcing a refresh lets a transient
// rejection recover on retry. Best-effort — never throws.
export async function refreshAppCheckToken(): Promise<void> {
  try {
    await firebase.appCheck().getToken(true);
  } catch {
    // ignore — the caller surfaces the original failure if the retry also fails
  }
}
