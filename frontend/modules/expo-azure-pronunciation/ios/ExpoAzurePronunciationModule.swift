import ExpoModulesCore
import MicrosoftCognitiveServicesSpeech
import AVFoundation

public class ExpoAzurePronunciationModule: Module {
  private var speechRecognizer: SPXSpeechRecognizer?
  private var referenceWords: [String] = []

  public func definition() -> ModuleDefinition {
    Name("ExpoAzurePronunciation")

    Events("onRecognizing", "onRecognized", "onError")

    Function("startAssessment") { (config: [String: Any]) in
      guard let authToken = config["authToken"] as? String,
            let region = config["region"] as? String,
            let referenceText = config["referenceText"] as? String else {
        self.sendEvent("onError", [
          "code": "INVALID_CONFIG",
          "message": "Missing required config fields: authToken, region, referenceText"
        ])
        return
      }

      let language = config["language"] as? String ?? "en-US"
      self.referenceWords = referenceText.split(separator: " ").map(String.init)

      self.prepareAndRecognize(authToken: authToken, region: region, referenceText: referenceText, language: language)
    }

    Function("stopAssessment") {
      self.stopRecognition()
    }
  }

  /// Set up audio session & recognizer (must happen on the calling thread for mic access),
  /// then dispatch the blocking recognizeOnce() to a background thread.
  private func prepareAndRecognize(authToken: String, region: String, referenceText: String, language: String) {
    do {
      let speechConfig = try SPXSpeechConfiguration(authorizationToken: authToken, region: region)
      speechConfig.speechRecognitionLanguage = language
      // Reduce silence timeouts for faster response
      try speechConfig.setPropertyTo("500", byName: "SpeechServiceConnection_EndSilenceTimeoutMs")
      try speechConfig.setPropertyTo("2000", byName: "SpeechServiceConnection_InitialSilenceTimeoutMs")

      // Audio session must be configured before SPXAudioConfiguration opens the mic
      let audioSession = AVAudioSession.sharedInstance()
      try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
      try audioSession.setActive(true)

      // Log audio session state
      let currentRoute = audioSession.currentRoute
      for input in currentRoute.inputs {
        NSLog("[Pronunciation] Audio input: \(input.portName) type=\(input.portType.rawValue) channels=\(input.channels?.count ?? 0)")
      }
      NSLog("[Pronunciation] Audio session: sampleRate=\(audioSession.sampleRate) inputAvailable=\(audioSession.isInputAvailable) category=\(audioSession.category.rawValue) mode=\(audioSession.mode.rawValue)")

      let audioConfig = SPXAudioConfiguration()

      let pronConfig = try SPXPronunciationAssessmentConfiguration(
        referenceText,
        gradingSystem: .hundredMark,
        granularity: .word,
        enableMiscue: true
      )

      let recognizer = try SPXSpeechRecognizer(speechConfiguration: speechConfig, audioConfiguration: audioConfig)
      try pronConfig.apply(to: recognizer)

      recognizer.addRecognizingEventHandler { [weak self] _, event in
        guard let self = self else { return }
        let partialText = event.result.text ?? ""
        let spokenWords = partialText.split(separator: " ")
        let wordIndex = max(0, spokenWords.count - 1)

        NSLog("[Pronunciation] Recognizing: text=\"\(partialText)\" wordIndex=\(wordIndex) duration=\(event.result.duration)")

        self.sendEvent("onRecognizing", [
          "text": partialText,
          "wordIndex": wordIndex
        ])
      }

      recognizer.addRecognizedEventHandler { [weak self] _, event in
        guard let self = self else { return }
        let result = event.result

        NSLog("[Pronunciation] Recognized: reason=\(result.reason.rawValue) text=\"\(result.text ?? "(nil)")\" duration=\(result.duration)")

        guard result.reason == .recognizedSpeech else {
          if result.reason == .noMatch {
            NSLog("[Pronunciation] NO_MATCH — no speech detected by SDK")
            self.sendEvent("onError", [
              "code": "NO_MATCH",
              "message": "음성을 인식하지 못했습니다. 다시 시도해 주세요."
            ])
          }
          return
        }

        let pronResult = SPXPronunciationAssessmentResult(result)
        var wordResults: [[String: Any]] = []

        if let detailResult = SPXPronunciationAssessmentResult(result) {
          let words = detailResult.words ?? []
          for wordData in words {
            wordResults.append([
              "word": wordData.word ?? "",
              "score": wordData.accuracyScore,
              "errorType": wordData.errorType ?? ""
            ])
          }
        }

        self.sendEvent("onRecognized", [
          "text": result.text ?? "",
          "pronScore": pronResult?.pronunciationScore ?? 0,
          "accuracyScore": pronResult?.accuracyScore ?? 0,
          "fluencyScore": pronResult?.fluencyScore ?? 0,
          "completenessScore": pronResult?.completenessScore ?? 0,
          "words": wordResults
        ])

        self.speechRecognizer = nil
      }

      recognizer.addCanceledEventHandler { [weak self] _, event in
        guard let self = self else { return }
        self.sendEvent("onError", [
          "code": "CANCELED",
          "message": event.errorDetails ?? "Recognition canceled"
        ])
        self.speechRecognizer = nil
      }

      self.speechRecognizer = recognizer

      // recognizeOnce() blocks until speech ends — run on background thread
      // so the JS thread stays free for UI updates (recording button, etc.)
      NSLog("[Pronunciation] Dispatching recognizeOnce to background thread...")
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          NSLog("[Pronunciation] recognizeOnce() started — listening...")
          try recognizer.recognizeOnce()
          NSLog("[Pronunciation] recognizeOnce() finished")
        } catch {
          NSLog("[Pronunciation] recognizeOnce() threw: \(error.localizedDescription)")
          self.sendEvent("onError", [
            "code": "RECOGNIZE_FAILED",
            "message": error.localizedDescription
          ])
          self.speechRecognizer = nil
        }
      }

    } catch {
      self.sendEvent("onError", [
        "code": "INIT_FAILED",
        "message": error.localizedDescription
      ])
    }
  }

  private func stopRecognition() {
    // Setting speechRecognizer to nil releases the recognizer, which
    // closes the microphone stream and cancels any in-flight recognition.
    speechRecognizer = nil
  }
}
