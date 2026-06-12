// Port of SpeechRecognizer.swift on top of expo-speech-recognition. toggle() starts
// recording when idle (resolving null) and stops when recording (resolving the
// accumulated transcript, like Swift's stopRecording()).

import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useCallback, useRef, useState } from "react";

// Error copy verbatim from SpeechRecognizer.swift:21-32.
const RECOGNIZER_UNAVAILABLE = "Speech recognition is not available on this device right now.";
const SPEECH_AUTHORIZATION_DENIED = "Speech recognition access is turned off.";
const MICROPHONE_AUTHORIZATION_DENIED = "Microphone access is turned off.";
const AUDIO_ENGINE_UNAVAILABLE = "SportsGPT could not start audio recording.";

export interface VoiceInput {
  isRecording: boolean;
  error?: string;
  toggle: () => Promise<string | null>;
  clearError: () => void;
}

export function useVoiceInput(): VoiceInput {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const isRecordingRef = useRef(false);
  const transcriptRef = useRef("");

  const stopLocally = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
  };

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript;
    if (transcript != null) {
      transcriptRef.current = transcript;
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    stopLocally();
    switch (event.error) {
      case "audio-capture":
        setError(AUDIO_ENGINE_UNAVAILABLE);
        break;
      case "not-allowed":
        setError(SPEECH_AUTHORIZATION_DENIED);
        break;
      case "service-not-allowed":
      case "language-not-supported":
        setError(RECOGNIZER_UNAVAILABLE);
        break;
      default:
        // The Swift recognizer cancels silently on mid-recognition errors.
        break;
    }
  });

  useSpeechRecognitionEvent("end", () => {
    stopLocally();
  });

  const toggle = useCallback(async (): Promise<string | null> => {
    if (isRecordingRef.current) {
      ExpoSpeechRecognitionModule.stop();
      isRecordingRef.current = false;
      setIsRecording(false);
      return transcriptRef.current.trim();
    }

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setError(RECOGNIZER_UNAVAILABLE);
      return null;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      const microphone = await ExpoSpeechRecognitionModule.getMicrophonePermissionsAsync();
      setError(microphone.granted ? SPEECH_AUTHORIZATION_DENIED : MICROPHONE_AUTHORIZATION_DENIED);
      return null;
    }

    setError(undefined);
    transcriptRef.current = "";
    try {
      ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true });
    } catch {
      setError(AUDIO_ENGINE_UNAVAILABLE);
      return null;
    }
    isRecordingRef.current = true;
    setIsRecording(true);
    return null;
  }, []);

  const clearError = useCallback(() => setError(undefined), []);

  return { isRecording, error, toggle, clearError };
}
