import ExpoModulesCore
import MicrosoftCognitiveServicesSpeech
import AVFoundation

public class ExpoAzurePronunciationModule: Module {
  private var speechRecognizer: SPXSpeechRecognizer?
  private var audioEngine: AVAudioEngine?
  private var pushStream: SPXPushAudioInputStream?
  private var referenceWords: [String] = []
  private var hasEmittedResult = false

  public func definition() -> ModuleDefinition {
    Name("ExpoAzurePronunciation")

    Events("onRecognizing", "onRecognized", "onError")

    AsyncFunction("startAssessment") { (config: [String: Any]) in
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
      self.startAssessment(authToken: authToken, region: region, referenceText: referenceText, language: language)
    }

    Function("stopAssessment") {
      self.fullCleanup()
    }
  }

  private func stopEngine() {
    if let engine = audioEngine, engine.isRunning {
      engine.inputNode.removeTap(onBus: 0)
      engine.stop()
    }
    audioEngine = nil
    pushStream?.close()
    pushStream = nil
  }

  private let cleanupQueue = DispatchQueue(label: "pronunciation.cleanup")

  private func fullCleanup() {
    // Stop engine immediately (thread-safe)
    stopEngine()
    let recognizer = speechRecognizer
    speechRecognizer = nil
    // Stop continuous recognition on background queue to avoid deadlock when called from SDK callback
    cleanupQueue.async {
      if let recognizer = recognizer {
        try? recognizer.stopContinuousRecognition()
        NSLog("[Pronunciation] Continuous recognition stopped")
      }
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      NSLog("[Pronunciation] Full cleanup done")
    }
  }

  private func startAssessment(authToken: String, region: String, referenceText: String, language: String) {
    fullCleanup()
    hasEmittedResult = false

    do {
      // Audio session setup
      let audioSession = AVAudioSession.sharedInstance()
      try audioSession.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .allowBluetooth])
      try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

      // Create push stream with 16kHz mono 16-bit PCM
      let audioFormat = SPXAudioStreamFormat(usingPCMWithSampleRate: 16000, bitsPerSample: 16, channels: 1)!
      let stream = SPXPushAudioInputStream(audioFormat: audioFormat)!
      self.pushStream = stream

      let audioConfig = SPXAudioConfiguration(streamInput: stream)!

      let speechConfig = try SPXSpeechConfiguration(authorizationToken: authToken, region: region)
      speechConfig.speechRecognitionLanguage = language

      let pronConfig = try SPXPronunciationAssessmentConfiguration(
        referenceText,
        gradingSystem: .hundredMark,
        granularity: .word,
        enableMiscue: true
      )

      let recognizer = try SPXSpeechRecognizer(
        speechConfiguration: speechConfig,
        audioConfiguration: audioConfig
      )
      try pronConfig.apply(to: recognizer)

      // Recognizing event — real-time word highlighting
      recognizer.addRecognizingEventHandler { [weak self] (_: SPXSpeechRecognizer, event: SPXSpeechRecognitionEventArgs) in
        guard let self = self else { return }
        let partialText = event.result.text ?? ""
        let spokenWords = partialText.split(separator: " ")
        let wordIndex = max(0, spokenWords.count - 1)
        NSLog("[Pronunciation] Recognizing: text=\"\(partialText)\" wordIndex=\(wordIndex)")
        self.sendEvent("onRecognizing", ["text": partialText, "wordIndex": wordIndex])
      }

      // Recognized event — final result with pronunciation scores
      recognizer.addRecognizedEventHandler { [weak self] (_: SPXSpeechRecognizer, event: SPXSpeechRecognitionEventArgs) in
        guard let self = self, !self.hasEmittedResult else { return }
        let result = event.result
        NSLog("[Pronunciation] Recognized event: reason=\(result.reason.rawValue) text=\"\(result.text ?? "(nil)")\"")

        guard result.reason == .recognizedSpeech else {
          // NoMatch in recognized event — log but wait for canceled event or retry
          NSLog("[Pronunciation] Recognized event with non-speech reason: \(result.reason.rawValue)")
          return
        }

        self.hasEmittedResult = true

        let pronResult = SPXPronunciationAssessmentResult(result)
        var wordResults: [[String: Any]] = []
        if let detailResult = SPXPronunciationAssessmentResult(result) {
          for wordData in detailResult.words ?? [] {
            wordResults.append([
              "word": wordData.word ?? "",
              "score": wordData.accuracyScore,
              "errorType": wordData.errorType ?? ""
            ])
          }
        }

        NSLog("[Pronunciation] Success: pron=\(pronResult?.pronunciationScore ?? 0) acc=\(pronResult?.accuracyScore ?? 0)")
        self.sendEvent("onRecognized", [
          "text": result.text ?? "",
          "pronScore": pronResult?.pronunciationScore ?? 0,
          "accuracyScore": pronResult?.accuracyScore ?? 0,
          "fluencyScore": pronResult?.fluencyScore ?? 0,
          "completenessScore": pronResult?.completenessScore ?? 0,
          "words": wordResults
        ])
        self.fullCleanup()
      }

      // Canceled event — handle errors and timeouts
      recognizer.addCanceledEventHandler { [weak self] (_: SPXSpeechRecognizer, event: SPXSpeechRecognitionCanceledEventArgs) in
        guard let self = self, !self.hasEmittedResult else { return }
        self.hasEmittedResult = true
        NSLog("[Pronunciation] Canceled: reason=\(event.reason.rawValue) error=\(event.errorDetails ?? "(nil)")")
        self.sendEvent("onError", [
          "code": "CANCELED",
          "message": event.errorDetails ?? "Recognition canceled"
        ])
        self.fullCleanup()
      }

      self.speechRecognizer = recognizer

      // Start AVAudioEngine
      let engine = AVAudioEngine()
      let inputNode = engine.inputNode
      let hwFormat = inputNode.outputFormat(forBus: 0)
      NSLog("[Pronunciation] HW format: sampleRate=\(hwFormat.sampleRate) channels=\(hwFormat.channelCount)")

      let decimationFactor = Int(hwFormat.sampleRate / 16000.0)

      var totalBytesPushed: Int = 0
      var peakLevel: Float = 0.0

      inputNode.installTap(onBus: 0, bufferSize: 4096, format: hwFormat) { [weak self] (buffer, _) in
        guard self != nil else { return }
        guard let floatData = buffer.floatChannelData?[0] else { return }
        let frameCount = Int(buffer.frameLength)
        guard frameCount > 0 else { return }

        let outFrames = frameCount / decimationFactor
        var int16Samples = [Int16](repeating: 0, count: outFrames)
        var localPeak: Float = 0.0

        for i in 0..<outFrames {
          let sample = floatData[i * decimationFactor]
          let abs = fabsf(sample)
          if abs > localPeak { localPeak = abs }
          let clamped = max(-1.0, min(1.0, sample))
          int16Samples[i] = Int16(clamped * 32767.0)
        }
        peakLevel = max(peakLevel, localPeak)

        let byteCount = outFrames * 2
        int16Samples.withUnsafeBytes { rawPtr in
          stream.write(Data(rawPtr))
        }
        totalBytesPushed += byteCount

        if totalBytesPushed % 32000 == 0 {
          NSLog("[Pronunciation] Pushed \(totalBytesPushed) bytes (~\(totalBytesPushed / 32000)s) peakLevel=\(peakLevel)")
          peakLevel = 0.0
        }
      }

      engine.prepare()
      try engine.start()
      self.audioEngine = engine

      // Start continuous recognition on background queue to avoid blocking JS thread
      NSLog("[Pronunciation] Starting continuous recognition...")
      cleanupQueue.async { [weak self] in
        do {
          try recognizer.startContinuousRecognition()
          NSLog("[Pronunciation] Continuous recognition started")
        } catch {
          NSLog("[Pronunciation] Failed to start continuous recognition: \(error)")
          self?.sendEvent("onError", ["code": "START_FAILED", "message": error.localizedDescription])
          self?.fullCleanup()
        }
      }

    } catch {
      self.fullCleanup()
      self.sendEvent("onError", ["code": "INIT_FAILED", "message": error.localizedDescription])
    }
  }
}
