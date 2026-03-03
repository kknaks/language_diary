require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'expo-module.config.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoAzurePronunciation'
  s.version        = '1.0.0'
  s.summary        = 'Expo module for Azure Speech pronunciation assessment'
  s.description    = 'Native Expo module wrapping Azure Cognitive Services Speech SDK for real-time pronunciation assessment'
  s.author         = 'Language Diary'
  s.homepage       = 'https://github.com/kknaks/language_diary'
  s.license        = { type: 'MIT' }
  s.source         = { git: '' }

  s.platform       = :ios, '15.0'
  s.swift_version  = '5.9'
  s.source_files   = '**/*.swift'

  s.dependency 'ExpoModulesCore'
  s.dependency 'MicrosoftCognitiveServicesSpeech-iOS', '~> 1.42'
end
