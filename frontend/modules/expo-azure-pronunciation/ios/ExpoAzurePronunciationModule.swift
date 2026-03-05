import ExpoModulesCore
import MicrosoftCognitiveServicesSpeech
import AVFoundation

public class ExpoAzurePronunciationModule: Module {
  private var speechRecognizer: SPXSpeechRecognizer?
  private var referenceWords: [String] = []

  public func definition() -> ModuleDefinition {
    Name("ExpoAzurePronunciation")

    Events("onRecognizing", "onRecognized", "onError", "onDebug")

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
      // End silence: 800ms for quick auto-completion after speech ends
      try speechConfig.setPropertyTo("800", byName: "SpeechServiceConnection_EndSilenceTimeoutMs")
      try speechConfig.setPropertyTo("3000", byName: "SpeechServiceConnection_InitialSilenceTimeoutMs")

      // Audio session must be configured before SPXAudioConfiguration opens the mic
      let audioSession = AVAudioSession.sharedInstance()
      try audioSession.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP])
      try audioSession.setActive(true)

      // 오디오 세션 상태 로그
      let currentRoute = audioSession.currentRoute
      for input in currentRoute.inputs {
        let msg = "AudioInput: \(input.portName) type=\(input.portType.rawValue) ch=\(input.channels?.count ?? 0)"
        NSLog("[Pronunciation] \(msg)")
        self.sendEvent("onDebug", ["message": msg])
      }
      let sessionMsg = "AudioSession: sr=\(audioSession.sampleRate) cat=\(audioSession.category.rawValue) mode=\(audioSession.mode.rawValue)"
      NSLog("[Pronunciation] \(sessionMsg)")
      self.sendEvent("onDebug", ["message": sessionMsg])

      // 오디오 세션 인터럽트/route change 감지
      NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { [weak self] note in
        let type = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) ?? 99
        let msg = "⚠️ AudioSession interruption type=\(type)"
        NSLog("[Pronunciation] \(msg)")
        self?.sendEvent("onDebug", ["message": msg])
      }
      NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: nil) { [weak self] note in
        let reason = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) ?? 99
        let msg = "🔀 AudioSession routeChange reason=\(reason)"
        NSLog("[Pronunciation] \(msg)")
        self?.sendEvent("onDebug", ["message": msg])
      }

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
        let msg = "CANCELED: code=\(event.errorCode.rawValue) details=\(event.errorDetails ?? "nil")"
        NSLog("[Pronunciation] \(msg)")
        self.sendEvent("onDebug", ["message": msg])
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
