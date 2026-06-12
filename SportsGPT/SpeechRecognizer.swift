//
//  SpeechRecognizer.swift
//  SportsGPT
//
//  Created by Codex on 4/8/26.
//

import AVFoundation
import Combine
import Foundation
import Speech

@MainActor
final class SpeechRecognizer: ObservableObject {
    enum SpeechRecognizerError: LocalizedError {
        case recognizerUnavailable
        case speechAuthorizationDenied
        case microphoneAuthorizationDenied
        case audioEngineUnavailable

        var errorDescription: String? {
            switch self {
            case .recognizerUnavailable:
                return "Speech recognition is not available on this device right now."
            case .speechAuthorizationDenied:
                return "Speech recognition access is turned off."
            case .microphoneAuthorizationDenied:
                return "Microphone access is turned off."
            case .audioEngineUnavailable:
                return "SportsGPT could not start audio recording."
            }
        }
    }

    @Published private(set) var isRecording = false
    @Published private(set) var transcript = ""

    private let audioEngine = AVAudioEngine()
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?

    func toggleRecording() async throws -> String? {
        if isRecording {
            return stopRecording()
        }

        try await startRecording()
        return nil
    }

    func stopRecording() -> String {
        recognitionRequest?.endAudio()
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionTask?.finish()
        isRecording = false
        return transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func cancel() {
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        isRecording = false
    }

    private func startRecording() async throws {
        guard let recognizer, recognizer.isAvailable else {
            throw SpeechRecognizerError.recognizerUnavailable
        }

        let speechAuthorized = await requestSpeechAuthorization()
        guard speechAuthorized else {
            throw SpeechRecognizerError.speechAuthorizationDenied
        }

        let micAuthorized = await requestMicrophoneAuthorization()
        guard micAuthorized else {
            throw SpeechRecognizerError.microphoneAuthorizationDenied
        }

        cancel()
        transcript = ""

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
        recognitionRequest = request

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak request] buffer, _ in
            request?.append(buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            throw SpeechRecognizerError.audioEngineUnavailable
        }

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }

            if let result {
                Task { @MainActor in
                    self.transcript = result.bestTranscription.formattedString
                }
            }

            if error != nil {
                Task { @MainActor in
                    self.cancel()
                }
            }
        }

        isRecording = true
    }

    private func requestSpeechAuthorization() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
    }

    private func requestMicrophoneAuthorization() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }
}
