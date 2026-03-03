package expo.modules.azurepronunciation

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.microsoft.cognitiveservices.speech.*
import com.microsoft.cognitiveservices.speech.audio.AudioConfig
import com.microsoft.cognitiveservices.speech.PronunciationAssessmentConfig
import com.microsoft.cognitiveservices.speech.PronunciationAssessmentGradingSystem
import com.microsoft.cognitiveservices.speech.PronunciationAssessmentGranularity
import com.microsoft.cognitiveservices.speech.PronunciationAssessmentResult

class ExpoAzurePronunciationModule : Module() {
  private var speechRecognizer: SpeechRecognizer? = null
  private var referenceWords: List<String> = emptyList()

  override fun definition() = ModuleDefinition {
    Name("ExpoAzurePronunciation")

    Events("onRecognizing", "onRecognized", "onError")

    Function("startAssessment") { config: Map<String, Any> ->
      val authToken = config["authToken"] as? String
      val region = config["region"] as? String
      val referenceText = config["referenceText"] as? String

      if (authToken == null || region == null || referenceText == null) {
        sendEvent("onError", mapOf(
          "code" to "INVALID_CONFIG",
          "message" to "Missing required config fields: authToken, region, referenceText"
        ))
        return@Function
      }

      val language = config["language"] as? String ?: "en-US"
      referenceWords = referenceText.split(" ")

      startRecognition(authToken, region, referenceText, language)
    }

    Function("stopAssessment") {
      stopRecognition()
    }
  }

  private fun startRecognition(authToken: String, region: String, referenceText: String, language: String) {
    try {
      val speechConfig = SpeechConfig.fromAuthorizationToken(authToken, region)
      speechConfig.speechRecognitionLanguage = language

      val audioConfig = AudioConfig.fromDefaultMicrophoneInput()

      val pronConfig = PronunciationAssessmentConfig(
        referenceText,
        PronunciationAssessmentGradingSystem.HundredMark,
        PronunciationAssessmentGranularity.Word,
        true // enableMiscue
      )

      val recognizer = SpeechRecognizer(speechConfig, audioConfig)
      pronConfig.applyTo(recognizer)

      recognizer.recognizing.addEventListener { _, event ->
        val partialText = event.result.text ?: ""
        val spokenWords = partialText.trim().split("\\s+".toRegex())
        val wordIndex = maxOf(0, spokenWords.size - 1)

        sendEvent("onRecognizing", mapOf(
          "text" to partialText,
          "wordIndex" to wordIndex
        ))
      }

      recognizer.recognized.addEventListener { _, event ->
        val result = event.result

        if (result.reason == ResultReason.RecognizedSpeech) {
          val pronResult = PronunciationAssessmentResult.fromResult(result)
          val wordResults = mutableListOf<Map<String, Any>>()

          pronResult?.words?.forEach { wordData ->
            wordResults.add(mapOf(
              "word" to (wordData.word ?: ""),
              "score" to wordData.accuracyScore,
              "errorType" to (wordData.errorType ?: "")
            ))
          }

          sendEvent("onRecognized", mapOf(
            "text" to (result.text ?: ""),
            "pronScore" to (pronResult?.pronunciationScore ?: 0.0),
            "accuracyScore" to (pronResult?.accuracyScore ?: 0.0),
            "fluencyScore" to (pronResult?.fluencyScore ?: 0.0),
            "completenessScore" to (pronResult?.completenessScore ?: 0.0),
            "words" to wordResults
          ))
        } else if (result.reason == ResultReason.NoMatch) {
          sendEvent("onError", mapOf(
            "code" to "NO_MATCH",
            "message" to "음성을 인식하지 못했습니다. 다시 시도해 주세요."
          ))
        }

        speechRecognizer = null
      }

      recognizer.canceled.addEventListener { _, event ->
        sendEvent("onError", mapOf(
          "code" to "CANCELED",
          "message" to (event.errorDetails ?: "Recognition canceled")
        ))
        speechRecognizer = null
      }

      speechRecognizer = recognizer
      recognizer.recognizeOnceAsync()

    } catch (e: Exception) {
      sendEvent("onError", mapOf(
        "code" to "INIT_FAILED",
        "message" to (e.message ?: "Failed to initialize speech recognizer")
      ))
    }
  }

  private fun stopRecognition() {
    speechRecognizer?.stopContinuousRecognitionAsync()
    speechRecognizer = null
  }
}
