// Picks a bet slip picture for a slip check: a screenshot from the library or a new photo.
import * as ImagePicker from "expo-image-picker";
import { ActionSheetIOS, Platform } from "react-native";

import { MAX_SLIP_IMAGE_BYTES, type SlipImage } from "../../api/slipCheck";

type Source = "library" | "camera";

function chooseSource(): Promise<Source | null> {
  if (Platform.OS !== "ios") return Promise.resolve("library");
  return new Promise((resolve) =>
    ActionSheetIOS.showActionSheetWithOptions(
      { title: "Check a bet slip", options: ["Choose a screenshot", "Take a photo", "Cancel"], cancelButtonIndex: 2 },
      (index) => resolve(index === 0 ? "library" : index === 1 ? "camera" : null)
    )
  );
}

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  quality: 0.8,
  // HEIC photos come back as JPEG; Juiced reads JPG, PNG, WebP and GIF.
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

/** Resolves the picked image, null when cancelled; throws a user-facing message on a problem. */
export async function pickSlipImage(): Promise<SlipImage | null> {
  const source = await chooseSource();
  if (!source) return null;
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("Allow camera access in Settings to photograph a slip, or choose a screenshot.");
  }
  const result =
    source === "camera" ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS) : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  if (asset.fileSize != null && asset.fileSize > MAX_SLIP_IMAGE_BYTES) {
    throw new Error("That picture is too large. Try a screenshot of the bet slip.");
  }
  return { uri: asset.uri, mimeType: asset.mimeType ?? "image/jpeg", fileName: asset.fileName ?? undefined };
}
