import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/** True when the JS bundle runs inside the Expo Go host app (Store Client). */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/**
 * Hold-to-talk STT needs native modules included in a dev/standalone build.
 * Expo Go does not ship @react-native-voice/voice or expo-speech-recognition natives — use text only.
 */
export function canUseNativeSpeechToText(): boolean {
  return Platform.OS !== 'web' && !isExpoGo();
}
