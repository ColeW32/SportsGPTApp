// Port of the composer (ContentView.swift:270-348, 462-480): multiline input with
// the italic placeholder, a mic button shown only while recording or when the
// input is empty, and the lime send button.

import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { canSend, useChatStore } from "../../state/chatStore";
import { palette } from "../../theme";
import { useVoiceInput } from "./useVoiceInput";

const RECORDING_RED = "#ED6B54"; // Color(red: 0.93, green: 0.42, blue: 0.33)

interface Props {
  onSend: () => void;
}

export function Composer({ onSend }: Props) {
  const input = useChatStore((s) => s.input);
  const setInput = useChatStore((s) => s.setInput);
  const isLoading = useChatStore((s) => s.isLoading);
  const { isRecording, error, toggle, clearError } = useVoiceInput();

  const isInputEmpty = input.trim().length === 0;
  const sendEnabled = canSend(input) && !isLoading;

  const handleMicPress = async () => {
    const transcript = await toggle();
    if (transcript) {
      const current = useChatStore.getState().input.trim();
      setInput(current.length === 0 ? transcript : `${current} ${transcript}`);
    }
  };

  return (
    <View style={styles.container}>
      {error ? (
        <Pressable style={styles.errorBanner} onPress={clearError}>
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      ) : null}

      <View style={styles.pill}>
        <View style={styles.inputWrapper}>
          {isInputEmpty ? (
            <Text
              style={styles.placeholder}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              pointerEvents="none"
            >
              What's the best bet today?
            </Text>
          ) : null}

          <TextInput
            value={input}
            onChangeText={setInput}
            multiline
            style={styles.input}
            cursorColor={palette.composerText}
            selectionColor={palette.composerText}
            returnKeyType="send"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={onSend}
          />
        </View>

        {isRecording || isInputEmpty ? (
          <Pressable
            style={[
              styles.circleButton,
              { backgroundColor: isRecording ? RECORDING_RED : palette.softPanel },
            ]}
            onPress={() => void handleMicPress()}
          >
            <SymbolView
              name={isRecording ? "stop.fill" : "mic.fill"}
              size={18}
              tintColor={isRecording ? palette.headerText : palette.ink}
            />
          </Pressable>
        ) : null}

        <Pressable
          style={[
            styles.circleButton,
            { backgroundColor: canSend(input) ? palette.lime : palette.softPanel },
          ]}
          onPress={onSend}
          disabled={!sendEnabled}
        >
          <SymbolView
            name="arrow.up"
            size={18}
            tintColor={canSend(input) ? palette.ink : palette.mutedInk}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  errorBanner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.ink,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 26,
    backgroundColor: palette.ink,
    borderWidth: 1,
    borderColor: "rgba(20, 20, 18, 0.15)", // palette.ink
  },
  inputWrapper: {
    flex: 1,
    justifyContent: "center",
  },
  placeholder: {
    position: "absolute",
    left: 0,
    right: 0,
    fontSize: 16,
    fontWeight: "500",
    fontStyle: "italic",
    color: palette.composerPlaceholder,
  },
  input: {
    fontSize: 16,
    fontWeight: "500",
    color: palette.composerText,
    paddingVertical: 2,
    maxHeight: 110,
  },
  circleButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
});
