// Apple rejects a build (and iOS kills the app on first use) when a purpose string is missing.
// expo-image-picker's `microphonePermission: false` once deleted the voice-input string (build 13).
import appJson from "../../app.json";

const PURPOSE_STRINGS = [
  "NSMicrophoneUsageDescription", // voice questions
  "NSSpeechRecognitionUsageDescription", // voice questions
  "NSPhotoLibraryUsageDescription", // slip check
  "NSCameraUsageDescription", // slip check
];

test("every permission the app uses keeps its purpose string", () => {
  const infoPlist = appJson.expo.ios.infoPlist as Record<string, string>;
  for (const key of PURPOSE_STRINGS) {
    expect(infoPlist[key]?.length).toBeGreaterThan(10);
  }
});

test("no config plugin is told to strip a permission the app needs", () => {
  const picker = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === "expo-image-picker") as [string, Record<string, unknown>];
  for (const value of Object.values(picker[1])) {
    expect(value).not.toBe(false);
  }
});
