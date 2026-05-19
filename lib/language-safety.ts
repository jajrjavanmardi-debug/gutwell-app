import type { AppLanguage } from './app-language';

const PERSIAN_CHAR_PATTERN = /[\u0600-\u06FF]/g;
const LATIN_WORD_PATTERN = /\b[A-Za-z]{3,}\b/g;
const ENGLISH_RECOMMENDATION_PATTERN =
  /\b(to support|quick answer|start here|how often|symptom check|coach tip|educational insight|not a diagnosis|general health goal|meal fit estimate|tips)\b/i;

export function shouldReplaceEnglishFallbackForPersian(
  language: AppLanguage,
  text: string,
): boolean {
  if (language !== 'fa') return false;

  const persianCharacterCount = text.match(PERSIAN_CHAR_PATTERN)?.length ?? 0;
  const latinWordCount = text.match(LATIN_WORD_PATTERN)?.length ?? 0;

  return (
    (latinWordCount >= 4 && ENGLISH_RECOMMENDATION_PATTERN.test(text)) ||
    (latinWordCount >= 8 && persianCharacterCount < 36) ||
    (latinWordCount >= 14 && latinWordCount > persianCharacterCount / 8)
  );
}
