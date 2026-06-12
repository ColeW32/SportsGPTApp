// Launch screen shown while the app boots (ContentView.swift:2008-2029), using the
// LaunchWordmark asset on the dark header background to match the native launch storyboard.

import { ActivityIndicator, Image, StyleSheet, View } from "react-native";

import { palette } from "../../theme";

export function LaunchScreen() {
  return (
    <View style={styles.container}>
      <Image
        source={require("../../../assets/images/LaunchWordmark.png")}
        style={styles.wordmark}
        resizeMode="contain"
        accessibilityLabel="SportsGPT"
      />
      <ActivityIndicator color={palette.headerText} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.headerBar,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  wordmark: {
    width: 260,
    height: 64,
  },
});
