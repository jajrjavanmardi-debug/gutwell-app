type Subscription = { remove: () => void };

let expoResultSub: Subscription | null = null;
let expoErrorSub: Subscription | null = null;

/** Avoid static import of expo-speech-recognition so Metro never resolves natives when unused (Expo Go). */
async function loadExpoSpeechRecognitionModule(): Promise<
  typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule | null
> {
  try {
    const mod = await import('expo-speech-recognition');
    return mod.ExpoSpeechRecognitionModule;
  } catch {
    return null;
  }
}

export function teardownExpoSpeechRecognition(): void {
  expoResultSub?.remove();
  expoErrorSub?.remove();
  expoResultSub = null;
  expoErrorSub = null;
  void loadExpoSpeechRecognitionModule()
    .then((ExpoSpeechRecognitionModule) => {
      if (!ExpoSpeechRecognitionModule) return;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        /* noop */
      }
    })
    .catch(() => {});
}

function isLikelyMicPermissionErrorRn(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('permission')
    || m.includes('not allowed')
    || m.includes('authorized')
    || m.includes('recognition')
    || /(^|\D)(7|9|11)(\D|$)/.test(message)
  );
}

/**
 * Fallback STT when `@react-native-voice/voice` is missing or `start()` fails.
 * Loads expo-speech-recognition lazily (dev / standalone builds only).
 */
export async function tryStartExpoSpeechRecognition(
  locale: string,
  onTranscript: (text: string) => void,
  onMicOrSpeechBlocked: () => void,
  onOtherFailure: () => void,
): Promise<(() => Promise<void>) | null> {
  teardownExpoSpeechRecognition();

  const ExpoSpeechRecognitionModule = await loadExpoSpeechRecognitionModule();
  if (!ExpoSpeechRecognitionModule) {
    onOtherFailure();
    return null;
  }

  try {
    let perm = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    if (!perm.granted) {
      perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    }
    if (!perm.granted || ('restricted' in perm && perm.restricted)) {
      onMicOrSpeechBlocked();
      return null;
    }
  } catch {
    onMicOrSpeechBlocked();
    return null;
  }

  expoResultSub = ExpoSpeechRecognitionModule.addListener('result', (ev) => {
    const text = ev.results[0]?.transcript?.trim();
    if (text) onTranscript(text);
  });

  expoErrorSub = ExpoSpeechRecognitionModule.addListener('error', (ev) => {
    if (ev.error === 'not-allowed' || ev.error === 'audio-capture') {
      onMicOrSpeechBlocked();
    } else {
      onOtherFailure();
    }
  });

  try {
    ExpoSpeechRecognitionModule.start({
      lang: locale,
      interimResults: true,
      continuous: false,
    });
  } catch {
    teardownExpoSpeechRecognition();
    onOtherFailure();
    return null;
  }

  return async () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      /* noop */
    }
    teardownExpoSpeechRecognition();
  };
}

export function parseRnVoiceError(error: unknown): 'mic' | 'other' {
  let raw = '';
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>;
    const inner = e.error;
    if (typeof inner === 'object' && inner !== null) {
      const i = inner as Record<string, unknown>;
      raw = [i.code, i.message, JSON.stringify(inner)].filter(Boolean).join(' ');
    } else {
      raw = String(inner ?? e.message ?? '');
    }
  } else {
    raw = String(error);
  }
  return isLikelyMicPermissionErrorRn(raw) ? 'mic' : 'other';
}
