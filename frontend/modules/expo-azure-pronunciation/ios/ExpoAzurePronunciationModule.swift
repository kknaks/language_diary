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

      self.startRecognition(authToken: authToken, region: region, referenceText: referenceText, language: language)
    }

    Function("stopAssessment") {
      self.stopRecognition()
    }
  }

  private func startRecognition(authToken: String, region: String, referenceText: String, language: String) {
    do {
      let speechConfig = try SPXSpeechConfiguration(authorizationToken: authToken, region: region)
      speechConfig.speechRecognitionLanguage = language

      // 기존 앱의 오디오 세션과 호환되도록 PlayAndRecord + VoiceChat 설정
      let audioSession = AVAudioSession.sharedInstance()
      try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
      try audioSession.setActive(true)

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

        self.sendEvent("onRecognizing", [
          "text": partialText,
          "wordIndex": wordIndex
        ])
      }

      recognizer.addRecognizedEventHandler { [weak self] _, event in
        guard let self = self else { return }
        let result = event.result

        guard result.reason == .recognizedSpeech else {
          if result.reason == .noMatch {
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
      try recognizer.recognizeOnce()

    } catch {
      self.sendEvent("onError", [
        "code": "INIT_FAILED",
        "message": error.localizedDescription
      ])
    }
  }

  private func stopRecognition() {
    if let recognizer = speechRecognizer {
      try? recognizer.stopContinuousRecognition()
      speechRecognizer = nil
    }
  }
}
