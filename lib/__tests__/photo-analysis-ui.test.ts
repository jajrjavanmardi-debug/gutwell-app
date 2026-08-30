/**
 * lib/__tests__/photo-analysis-ui.test.ts
 *
 * Presentation guards for the flagship Photo Analysis flow, covering the three
 * problems found on a physical device in Build 1.0.0 (3):
 *
 *  1. The Generate CTA read as broken. Its enabled style was never the issue —
 *     Colors.secondary is a bright mint — but the DISABLED state is what a
 *     first-time user meets first (a description is required and nothing said
 *     so), and it was painted #2a3d34 at 0.55 opacity on a black background.
 *     A running analysis looked identical, because isAnalyzing also disables.
 *  2. Revision was reachable only through a FontSize.sm "+ Add more" text link
 *     that did not read as interactive.
 *  3. Covered in photo-analysis-history.test.ts.
 *
 * Source-text assertions: this screen is ~3k lines with native modules
 * throughout (camera, voice, StoreKit), and rendering it in jsdom would test
 * the mocks. What is pinned here is what the reviewer would look at in a diff.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { translations } from '../i18n';

const root = join(__dirname, '..', '..');
const SCREEN = readFileSync(join(root, 'app', 'photo-analysis.tsx'), 'utf8');
const THEME = readFileSync(join(root, 'constants', 'theme.ts'), 'utf8');

/** Comments name the very things these tests ban, so strip them first. */
const code = SCREEN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const styles = code.slice(code.indexOf('StyleSheet.create('));
const block = (name: string) => {
  const start = styles.indexOf(`  ${name}: {`);
  return start === -1 ? '' : styles.slice(start, styles.indexOf('  },', start));
};

describe('the Generate Analysis CTA reads as the primary action', () => {
  test('the enabled style is the bright brand green, unchanged', () => {
    expect(block('analyzeCombinedButton')).toContain('backgroundColor: Colors.secondary');
    // The token itself must stay bright — a dark value here would reintroduce
    // the reported symptom without touching this screen at all.
    expect(THEME).toContain("secondary: '#52B788'");
    expect(block('analyzeCombinedButtonText')).toContain("color: '#000000'");
  });

  test('the disabled style is tokenised, readable, and clearly distinct', () => {
    const disabled = block('analyzeCombinedButtonDisabled');
    expect(disabled).toContain('backgroundColor: Colors.disabled');
    expect(disabled).not.toContain('#2a3d34');
    // No opacity at all. Parent opacity composites the icon and label too, so
    // dimming the background that way is what made them unreadable. The muted
    // look is carried by the foreground colour instead.
    expect(disabled).not.toMatch(/opacity/);
    expect(block('analyzeCombinedButtonTextDisabled')).toContain('color: Colors.textSecondary');
    // Distinct from enabled, or the state would be invisible.
    expect(block('analyzeCombinedButton')).not.toContain('Colors.disabled');
  });

  test('the disabled icon and label are not left at the enabled foreground', () => {
    // The reported "dead control": #000000 on #2A2A2A is about 1.1:1. Both the
    // icon and the text must switch, not just the background.
    expect(code).toContain("color={analyzeDisabled ? Colors.textSecondary : '#000000'}");
    expect(code).toContain('analyzeDisabled && styles.analyzeCombinedButtonTextDisabled');
  });

  test('loading is its own presentation, not the disabled one', () => {
    expect(code).toContain('{isAnalyzing ? (');
    const branch = code.slice(code.indexOf('{isAnalyzing ? ('), code.indexOf('</Pressable>', code.indexOf('{isAnalyzing ? (')));
    expect(branch).toContain('<ActivityIndicator');
    expect(branch).toContain('t.photoAnalysis.analysing');
  });

  test('the enable/disable logic itself is unchanged', () => {
    // The audit found a presentation bug, not a logic bug. isAnalyzing must
    // still disable the button — that is the double-submission guard.
    expect(code).toContain('const analyzeDisabled =\n    isAnalyzing ||');
    expect(code).toContain('disabled={analyzeDisabled}');
    expect(code).toContain('accessibilityState={{ disabled: analyzeDisabled }}');
  });

  test('a disabled CTA says why, and only for the recoverable reason', () => {
    expect(code).toContain('t.photoAnalysis.generateNeedsDescription');
    // The hint belongs to TEXT-ONLY mode, which is the only mode that still
    // needs words. It used to be gated on `!isOnboarding` instead, back when a
    // photo run also demanded a description; showing it in photo mode now
    // would advertise a requirement that no longer exists.
    expect(code).toContain('textOnlyMode && analyzeDisabled && !isAnalyzing && !mealDescription.trim() ?');
    expect(code).not.toContain('analyzeDisabled && !isAnalyzing && !isOnboarding && !mealDescription.trim() ?');
  });

  test('an active recording blocks analysis and says so', () => {
    // Voice is press-and-hold, but any stuck-listening path left Generate
    // tappable, and finishVoiceHold only applies the transcript when the hold
    // ends — so analysing mid-recording submitted the previous text.
    // The declaration itself, bounded by its own terminating semicolon.
    // A previous version of this slice used a marker that appears EARLIER in
    // the file, so it silently read an empty string and passed either way.
    const start = code.indexOf('const analyzeDisabled =');
    const gate = code.slice(start, code.indexOf(';', start));
    expect(gate).toContain('const analyzeDisabled =');
    expect(gate).toContain('isListening');
    // The recording hint takes priority over the description hint.
    expect(code).toContain('{isListening ? (');
    expect(code).toContain('t.photoAnalysis.generateNeedsRecordingStopped');
    // Blocking, not auto-finalising: stopping the engine is async and racing
    // it against a submission is how the transcript gets lost.
    expect(code).not.toMatch(/handleGenerateAnalysis[\s\S]{0,200}finishVoiceHold/);
  });

  test('no new hardcoded colour was introduced by these states', () => {
    for (const name of ['analyzeCombinedButtonDisabled', 'analyzeHint']) {
      expect(`${name}: ${/#[0-9a-f]{6}/i.test(block(name))}`).toBe(`${name}: false`);
    }
  });
});

describe('refinement is discoverable after a result', () => {
  test('the subtle "+ Add more" link is gone', () => {
    expect(code).not.toContain('addMoreLink');
    expect(code).not.toContain('t.photoAnalysis.addMore');
    expect(styles).not.toContain('addMoreLinkText');
  });

  test('a single labelled CTA replaces it', () => {
    expect(code).toContain('t.photoAnalysis.refineAnalysis');
    expect(code).toContain('t.photoAnalysis.refineAnalysisHint');
    // One entry point, not two competing ones.
    expect(code.match(/t\.photoAnalysis\.refineAnalysis\b/g)?.length).toBe(2);
  });

  test('it sits beneath the analysis body, where the reader forms an opinion', () => {
    expect(code.indexOf('sanitizeAnalysisForDisplay(analysis)')).toBeLessThan(
      code.indexOf('styles.refineButton'),
    );
  });

  test('it routes into the EXISTING revision flow, not a new one', () => {
    const cta = code.slice(code.indexOf('styles.refineButton') - 900, code.indexOf('styles.refineButton'));
    expect(cta).toContain('onPress={toggleCorrectionForm}');
    // The toggle still drives the SAME accuracyAnswer state the correction
    // form is gated on — it adds the reveal scroll, it does not replace the flow.
    const toggle = code.slice(code.indexOf('const toggleCorrectionForm'), code.indexOf('const handleApplyCorrection'));
    expect(toggle).toContain("setAccuracyAnswer(willOpen ? 'no' : null);");
    // No new screen, route or chat surface.
    expect(cta).not.toMatch(/router\.(push|navigate)/);
  });

  test('it is unmistakably interactive but secondary to the result', () => {
    const b = block('refineButton');
    expect(b).toContain('borderColor: Colors.secondary');
    expect(b).toContain('borderWidth: 1');
    // Outlined, never filled with the primary CTA colour.
    expect(b).not.toContain('backgroundColor: Colors.secondary');
    expect(Number(/minHeight:\s*(\d+)/.exec(b)?.[1])).toBeGreaterThanOrEqual(44);
    expect(code).toContain('accessibilityRole="button"');
    expect(code).toContain('accessibilityHint={t.photoAnalysis.refineAnalysisHint}');
  });

  test('it stays available after a revision, so corrections can be repeated', () => {
    // submitChatCorrection clears accuracyAnswer rather than latching a
    // terminal state, and the CTA is not conditioned on revision count.
    expect(code).toContain('setAccuracyAnswer(null);');
    const cta = code.slice(code.indexOf('styles.refineButton') - 900, code.indexOf('styles.refineButton'));
    expect(cta).not.toMatch(/userFeedback\.length|hasRevised|revisionCount/);
  });

  test('revision still goes through meal_revise with prior context', () => {
    expect(code).toContain('reviseMealAnalysis({');
    expect(code).toContain('previousAnalysis:');
    expect(code).toContain('priorUserCorrections: userFeedback');
    expect(code).toContain('setUserFeedback((prior) => [...prior, correction]);');
  });
});

describe('the flow that already worked still works', () => {
  test('every preserved capability is still wired', () => {
    for (const anchor of [
      'launchCameraAsync',
      'launchImageLibraryAsync',
      'ensurePhotoEntitlement',
      'setTextOnlyMode(false)',
      'analyzeMealPhoto(imageBase64',
      'analyzeMealText(',
      'reviseMealAnalysis({',
      'locationContext',
      'afterMealActivity',
      'analysisRequestIdRef',
    ]) {
      expect(`${anchor}: ${code.includes(anchor)}`).toBe(`${anchor}: true`);
    }
  });
});

describe('new copy is localized and makes no medical claim', () => {
  const KEYS = [
    'refineAnalysis',
    'refineAnalysisHint',
    'analysing',
    'generateNeedsDescription',
    'mealTitleFallback',
  ] as const;

  test('every new key exists in EN and DE', () => {
    for (const lang of ['en', 'de'] as const) {
      for (const key of KEYS) {
        const value = translations[lang].photoAnalysis[key];
        expect(`${lang}.${key}: ${typeof value === 'string' && value.length > 0}`)
          .toBe(`${lang}.${key}: true`);
      }
    }
  });

  test('German is translated, not copied from English', () => {
    for (const key of KEYS) {
      expect(`${key}`).toBe(`${key}`);
      expect(translations.de.photoAnalysis[key]).not.toBe(translations.en.photoAnalysis[key]);
    }
  });

  test('the approved wording is what ships', () => {
    const en = translations.en.photoAnalysis;
    const de = translations.de.photoAnalysis;
    expect(en.refineAnalysis).toBe('Refine analysis');
    // Re-pinned to the Stage 5B.2 wording. The hint now normalizes correction
    // — naming what AI can miss — instead of listing what the box accepts.
    expect(en.refineAnalysisPrompt).toBe('Not quite right?');
    expect(en.refineAnalysisHint).toBe(
      'AI can miss an ingredient or context. Add or correct a detail and GutWell will reconsider the analysis.',
    );
    expect(de.refineAnalysis).toBe('Analyse verfeinern');
    expect(de.refineAnalysisPrompt).toBe('Passt etwas nicht?');
    expect(de.refineAnalysisHint).not.toBe(en.refineAnalysisHint);
    expect(de.refineAnalysisHint.length).toBeGreaterThan(20);
  });

  test('no diagnosis or treatment language is introduced', () => {
    for (const lang of ['en', 'de'] as const) {
      for (const key of KEYS) {
        expect(`${lang}.${key}`).toBe(`${lang}.${key}`);
        expect(translations[lang].photoAnalysis[key]).not.toMatch(
          /diagnos|treat(ment|s)?\b|cure|prevent|disease|symptom of|medical advice|heilen|behandl|diagnos/i,
        );
      }
    }
  });
});

describe('the meal identity is stable across refinement', () => {
  /**
   * Build 4 showed the headline drifting with the narrative: "Meal analysis"
   * for walnuts, then "Focusing on meal timing" and "Walnuts eaten about 3"
   * after refinements, with the chip repeating the same prose. The analysis
   * TEXT changes on every refinement; the food usually does not.
   */
  test('identity is held in state, not re-derived on every render', () => {
    expect(code).toContain("const [mealIdentity, setMealIdentity] = useState('');");
    // Both result surfaces read that one value. The count dropped from 3 to 2
    // in Stage 5B.2: the in-app surface's info chip was removed when that
    // surface moved onto AnalysisResult, so the chip's read went with it. The
    // invariant is unchanged — identity comes from state, never re-derived.
    expect(code.match(/mealIdentity \|\| t\.photoAnalysis\.mealTitleFallback/g)?.length).toBe(2);
    expect(code).not.toContain('extractMealName(analysis)');
  });

  test('a new analysis resolves identity from the model, then the user words', () => {
    const fn = code.slice(code.indexOf('const resolveMealIdentity'), code.indexOf('const handleGenerateAnalysis'));
    expect(fn).toContain('extractMealTitle(analysisText, fallback)');
    expect(fn).toContain('if (fromAnalysis !== fallback) return fromAnalysis;');
    expect(fn).toContain('conciseFoodIdentity(userText) ?? fallback');
    // Both entry points set it.
    expect(code).toContain('setMealIdentity(resolveMealIdentity(rawResult, description));');
    expect(code).toContain('setMealIdentity(resolveMealIdentity(rawResult, mealDescription));');
  });

  test('a context-only refinement preserves the identity', () => {
    // The setter is reachable ONLY under the different-food branch.
    const revise = code.slice(code.indexOf('setAnalysis(correctedAnalysis);'), code.indexOf('setResultsScrollKey((key) => key + 1);', code.indexOf('setAnalysis(correctedAnalysis);')));
    expect(revise).toContain('if (correctionIsDifferentFood) {');
    expect(revise).toContain('setMealIdentity(resolveMealIdentity(correctedAnalysis, correction));');
  });

  test('an actual food correction updates the identity', () => {
    // Same signal that clears the meal context for the model, so the two
    // cannot disagree about whether the food changed.
    expect(code).toContain('const correctionIsDifferentFood = isDifferentFoodCorrection(correction);');
  });

  test('a new photo clears the previous identity', () => {
    const store = code.slice(code.indexOf('const storeCapturedPhoto'), code.indexOf('const ensurePhotoEntitlement'));
    expect(store).toContain("setMealIdentity('');");
  });

  test('no result surface renders raw narrative as the meal name', () => {
    /**
     * Was "the chip no longer renders raw narrative". The chip it named was
     * removed in Stage 5B.2 along with the rest of the old in-app layout, so
     * the test now asserts the RULE rather than that one element: no surface
     * may derive the displayed meal name from the analysis text, because
     * extractMealName has no scaffolding guard and would show
     * "Looks like you're w…". Every surface reads `mealIdentity`.
     *
     * Scoped to DISPLAY: extractMealName legitimately still names the row
     * written to food_logs, which is persistence, not a headline.
     */
    const surfaces = code.match(/mealName=\{[^}]+\}/g) ?? [];
    expect(surfaces.length).toBeGreaterThanOrEqual(2);
    for (const s of surfaces) expect(s).toContain('mealIdentity');
  });
});

describe('one correction entry point, revealed when it opens', () => {
  test('the duplicate accuracy row is gone', () => {
    for (const gone of ['t.photoAnalysis.isThisAccurate', 't.photoAnalysis.fixResults', 'fixResultsRow', 'fixResultsButton', 'doneButtonText']) {
      expect(`${gone}: ${code.includes(gone)}`).toBe(`${gone}: false`);
    }
    // Refine remains the single entry.
    expect(code).toContain('t.photoAnalysis.refineAnalysis');
  });

  test('nothing measurable was removed with it', () => {
    // accuracyAnswer never had analytics or persistence; the only track()
    // calls on this screen are the two analysis events.
    const events = [...code.matchAll(/track\(([^)]*)\)/g)].map((m) => m[1]);
    expect(events.every((e) => /FOOD_SCANNED|FIRST_ANALYSIS_COMPLETED/.test(e))).toBe(true);
    // The state itself survives — it gates the correction form.
    expect(code).toContain("useState<'yes' | 'no' | null>(null)");
  });

  test('opening scrolls the form into view, after layout', () => {
    const fn = code.slice(code.indexOf('const toggleCorrectionForm'), code.indexOf('const handleApplyCorrection'));
    // Deferred a frame: scrolling in the same tick lands on the pre-expansion
    // offset, because the card has not been laid out yet.
    expect(fn).toContain('requestAnimationFrame(');
    expect(fn).toContain('resultsScrollRef.current?.scrollTo(');
    expect(fn).toContain('correctionSectionYRef.current');
    // Only on open — collapsing must not move the viewport.
    expect(fn).toContain('if (!willOpen) return;');
    expect(code).toContain('correctionSectionYRef.current = e.nativeEvent.layout.y;');
  });

  test('the results pane is keyboard-safe', () => {
    // Step 2 has had a KeyboardAvoidingView all along; Step 3, which hosts the
    // correction textarea, had none, so the keyboard covered it.
    const results = code.slice(code.indexOf('ref={resultsScrollRef}') - 600, code.indexOf('ref={resultsScrollRef}'));
    expect(results).toContain('<KeyboardAvoidingView');
    expect(results).toContain("behavior={Platform.OS === 'ios' ? 'padding' : undefined}");
    expect(results).toContain('keyboardVerticalOffset={90}');
    // Taps still reach the form while the keyboard is open.
    expect(code).toContain('keyboardShouldPersistTaps="handled"');
  });

  test('repeated revisions and meal_revise are untouched', () => {
    expect(code).toContain('reviseMealAnalysis({');
    expect(code).toContain('priorUserCorrections: userFeedback');
    expect(code).toContain('setUserFeedback((prior) => [...prior, correction]);');
    // Cleared after each revision, so the CTA reopens for the next one.
    expect(code).toContain('setAccuracyAnswer(null);');
  });
});

describe('language selection is unchanged apart from the label', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  // Comments stripped: this file's doc block explains that AsyncStorage is
  // deliberately NOT touched here, and matching that prose would assert the
  // opposite of what it says.
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const SWITCHER = strip(require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'components', 'LanguageSwitcher.tsx'), 'utf8',
  ));

  test('the chip shows the full language name, not a two-letter code', () => {
    expect(SWITCHER).toContain('{LANGUAGE_LABELS[language]}');
    expect(SWITCHER).not.toContain('language.toUpperCase()');
  });

  test('there is still exactly one language state, and it persists', () => {
    // No local language state, no second setter — the switcher reads context.
    expect(SWITCHER).toContain('const { language, setLanguage } = useLanguage();');
    expect(SWITCHER).not.toMatch(/useState<AppLanguage>|AsyncStorage/);
  });

  test('only English and German, and no RTL', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // Same reason: lib/language.ts documents that a legacy 'fa' value is
    // migrated to 'en'. The migration must stay; the language must not.
    const LANG = strip(require('fs').readFileSync(
      require('path').join(__dirname, '..', 'language.ts'), 'utf8',
    ));
    expect(LANG).toContain("export const SUPPORTED_LANGUAGES: AppLanguage[] = ['en', 'de'];");
    expect(LANG).not.toMatch(/'fa'\s*[,\]]|forceRTL|allowRTL|isRTL/);
    expect(SWITCHER).toContain('SUPPORTED_LANGUAGES.map');
  });
});

describe('scoring was not touched', () => {
  test('the score still comes from the model, with no hardcoded fallback', () => {
    expect(code).toContain('extractMealImpactScore(');
    expect(code).not.toMatch(/mealImpactScore\s*(\?\?|\|\|)\s*5\b/);
    // The bespoke score badge was replaced by AnalysisResult's score in
    // Stage 5B.2. The guarantee is the same and is now asserted on the prop:
    // the value comes from the model's text, never a fallback number.
    expect(code).toContain('score={mealImpactScore}');
    expect(code).not.toMatch(/score=\{\s*mealImpactScore\s*(\?\?|\|\|)/);
  });
});

describe('the correction input stays visible above the keyboard', () => {
  /**
   * Build 5 added a KeyboardAvoidingView to the Step 3 pane and the input was
   * STILL hidden on device. `behavior="padding"` shrinks the ScrollView's
   * frame; it never moves contentOffset. That shrink raises maxOffset by the
   * keyboard height, so the headroom to reveal the input already existed —
   * nothing was scrolling into it.
   *
   * The expansion scroll was not the gap: it uses correctionSectionYRef, a
   * PRE-keyboard offset captured on layout, and it fires on expand. What was
   * missing is a second, re-measured scroll once the keyboard is actually up.
   */
  const reveal = code.slice(code.indexOf('const revealCorrectionInput'), code.indexOf('const handleApplyCorrection'));

  test('the expansion auto-scroll is untouched', () => {
    const toggle = code.slice(code.indexOf('const toggleCorrectionForm'), code.indexOf('const revealCorrectionInput'));
    expect(toggle).toContain('requestAnimationFrame(');
    expect(toggle).toContain('correctionSectionYRef.current');
    expect(toggle).toContain('if (!willOpen) return;');
    expect(code).toContain('correctionSectionYRef.current = e.nativeEvent.layout.y;');
  });

  test('the correction input has explicit focus handling', () => {
    expect(code).toContain('ref={correctionInputRef}');
    expect(code).toContain('onFocus={() => {');
    expect(code).toContain('correctionFocusedRef.current = true;');
    expect(code).toContain('correctionFocusedRef.current = false;');
  });

  test('a keyboard-driven scroll runs AFTER the keyboard is up', () => {
    // didShow, not willShow: the frame is only final once presentation ends,
    // and measuring earlier reads the stale layout.
    expect(code).toContain("Keyboard.addListener('keyboardDidShow'");
    expect(code).toContain('revealCorrectionInput(event.endCoordinates.screenY)');
    expect(code).not.toContain('keyboardWillShow');
  });

  test('the focused input is re-measured, not reused from expansion', () => {
    // The whole defect: reusing the pre-keyboard offset.
    expect(reveal).toContain('correctionInputRef.current?.measureInWindow(');
    expect(reveal).not.toContain('correctionSectionYRef');
    // Scrolls by the measured overlap only, so the view moves the minimum.
    expect(reveal).toContain('const overlap = y + height + CORRECTION_KEYBOARD_MARGIN - keyboardTop;');
    expect(reveal).toContain('if (overlap <= 0) return;');
    expect(reveal).toContain('resultsScrollOffsetRef.current + overlap');
  });

  test('the reveal targets the existing results ScrollView', () => {
    expect(reveal).toContain('resultsScrollRef.current?.scrollTo(');
    // scrollTo is absolute and RN has no scrollBy, so the live offset is tracked.
    expect(code).toContain('resultsScrollOffsetRef.current = e.nativeEvent.contentOffset.y;');
    expect(code).toContain('scrollEventThrottle={16}');
  });

  test('it is a no-op unless the correction input holds focus', () => {
    expect(reveal).toContain('if (!correctionFocusedRef.current) return;');
  });

  test('focusing while a keyboard is already open still reveals', () => {
    // Moving here from the meal field fires no keyboardDidShow, so the focus
    // path runs the same reveal once layout settles.
    const focus = code.slice(code.indexOf('onFocus={() => {'), code.indexOf('onBlur={'));
    expect(focus).toContain('Keyboard.metrics()?.screenY');
    expect(focus).toContain('requestAnimationFrame(() => revealCorrectionInput(shown))');
  });

  test('the listener is cleaned up', () => {
    const effect = code.slice(code.indexOf("Keyboard.addListener('keyboardDidShow'") - 300, code.indexOf('const handleApplyCorrection'));
    expect(effect).toContain('return () => sub.remove();');
  });

  test('manual scrolling and tap-to-dismiss still work', () => {
    expect(code).toContain('keyboardShouldPersistTaps="handled"');
    // on-drag would dismiss the keyboard the moment the user scrolls, which
    // fights the requirement that the pane stay scrollable while it is open.
    expect(code).not.toContain('keyboardDismissMode="on-drag"');
    expect(code).not.toContain('scrollEnabled={false}');
  });

  test('Apply correction stays inside the same scrollable flow', () => {
    // Not lifted out into a pinned footer — it must be reachable by scrolling.
    // The results ScrollView is the SECOND one in the file — Step 2 has its
    // own — so the closing tag has to be found after this one opens, not from
    // the start of the file, which silently produced an empty slice.
    const open = code.indexOf('ref={resultsScrollRef}');
    const scroll = code.slice(open, code.indexOf('</ScrollView>', open));
    expect(scroll.length).toBeGreaterThan(1000);
    expect(scroll).toContain('handleApplyCorrection');
    expect(scroll).toContain('t.photoAnalysis.applyCorrection');
  });

  test('no fake fix: no giant static bottom spacer, no offset inflation', () => {
    // The room already exists; the defect was that nothing scrolled into it.
    expect(code).toContain('keyboardVerticalOffset={90}');
    expect(block('analysisResultsContent')).toContain('paddingBottom: Spacing.xl * 3');
    const pads = [...styles.matchAll(/paddingBottom:\s*(\d+)/g)].map((m) => Number(m[1]));
    for (const p of pads) expect(p).toBeLessThan(200);
  });

  test('the Step 3 KeyboardAvoidingView is retained', () => {
    // The padding is what supplies the headroom the reveal scrolls into.
    const results = code.slice(code.indexOf('ref={resultsScrollRef}') - 600, code.indexOf('ref={resultsScrollRef}'));
    expect(results).toContain('<KeyboardAvoidingView');
    expect(results).toContain("behavior={Platform.OS === 'ios' ? 'padding' : undefined}");
    // Explicitly NOT the alternative that would double-compensate.
    expect(code).not.toContain('automaticallyAdjustKeyboardInsets');
  });
});
