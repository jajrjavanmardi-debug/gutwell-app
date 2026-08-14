/**
 * Analysis section parser + onboarding result wiring.
 *
 * The parser is pure and tested directly. The screen wiring is asserted
 * structurally, because the two properties that matter most cannot be observed
 * from the parser alone: that the normal result is untouched, and that
 * onboarding has exactly one exit which persists the meal.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseAnalysisSections, toShortSentence } from '../analysis-sections';
import { buildFoodLogPayload } from '../meal-log';
import { extractMealTitle, extractScoreReason } from '../photo-analysis-history';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PHOTO = strip(read('app', 'photo-analysis.tsx'));
const RESULT = strip(read('components', 'AnalysisResult.tsx'));

/** A reply in the exact shape the Edge Function mandates. */
const FULL = `🍽️ MEAL
Chicken salad with a creamy dressing.

📊 SCORE
7/10 — mostly balanced, the dressing is the main factor.

⚠️ POSSIBLE SENSITIVITY
The creamy dressing may feel heavy for some people.

✅ BETTER OPTION
An olive-oil vinaigrette could feel lighter.

➡️ NEXT STEP
Notice how you feel over the next few hours.

Important note: This analysis is for informational purposes only.`;

describe('parseAnalysisSections — the mandated shape', () => {
  const parsed = parseAnalysisSections(FULL);

  test('finds all five sections', () => {
    expect(parsed.complete).toBe(true);
  });

  test('extracts each body without its heading', () => {
    expect(parsed.meal).toContain('Chicken salad');
    expect(parsed.score).toContain('7/10');
    expect(parsed.sensitivity).toContain('may feel heavy');
    expect(parsed.betterOption).toContain('vinaigrette');
    expect(parsed.nextStep).toContain('next few hours');
  });

  test('a section body never carries another section heading', () => {
    for (const body of [parsed.meal, parsed.score, parsed.sensitivity, parsed.betterOption]) {
      expect(body).not.toMatch(/NEXT STEP|BETTER OPTION|POSSIBLE SENSITIVITY/);
    }
  });

  test('the trailing safety footer stays with the last section rather than vanishing', () => {
    expect(parsed.nextStep).toContain('informational purposes');
  });

  test('a well-formed reply has no preamble', () => {
    expect(parsed.preamble).toBe('');
  });
});

describe('parseAnalysisSections — preamble', () => {
  test('text above the first heading is captured, not dropped', () => {
    const p = parseAnalysisSections(`Here is what I can see in your photo.\n\n${FULL}`);
    expect(p.complete).toBe(true);
    expect(p.preamble).toBe('Here is what I can see in your photo.');
  });

  test('the preamble never leaks into a section body', () => {
    const p = parseAnalysisSections(`Preamble line.\n\n${FULL}`);
    expect(p.meal).not.toContain('Preamble line');
    expect(p.score).not.toContain('Preamble line');
  });
});

describe('parseAnalysisSections — resilience', () => {
  test('parses when the emoji is dropped', () => {
    const noEmoji = FULL.replace(/[🍽️📊⚠️✅➡️]/gu, '').trim();
    expect(parseAnalysisSections(noEmoji).complete).toBe(true);
  });

  test('parses when headings carry a colon', () => {
    const colons = FULL.replace(/^(🍽️ MEAL|📊 SCORE)$/gmu, '$1:');
    expect(parseAnalysisSections(colons).complete).toBe(true);
  });

  test('parses when content sits on the heading line', () => {
    const inline = `🍽️ MEAL Chicken salad
📊 SCORE 7/10 balanced
⚠️ POSSIBLE SENSITIVITY dressing may feel heavy
✅ BETTER OPTION vinaigrette
➡️ NEXT STEP notice how you feel`;
    const p = parseAnalysisSections(inline);
    expect(p.complete).toBe(true);
    expect(p.meal).toBe('Chicken salad');
  });

  test('parses when sections are reordered', () => {
    const reordered = [
      '📊 SCORE\n7/10',
      '🍽️ MEAL\nSalad',
      '➡️ NEXT STEP\nObserve',
      '⚠️ POSSIBLE SENSITIVITY\nDressing',
      '✅ BETTER OPTION\nVinaigrette',
    ].join('\n\n');
    expect(parseAnalysisSections(reordered).complete).toBe(true);
  });

  test('body prose mentioning a label is not mistaken for a heading', () => {
    const tricky = FULL.replace(
      'An olive-oil vinaigrette could feel lighter.',
      'A better option here would be an olive-oil vinaigrette.',
    );
    const p = parseAnalysisSections(tricky);
    expect(p.complete).toBe(true);
    expect(p.betterOption).toContain('better option here would be');
  });
});

describe('parseAnalysisSections — never drops content', () => {
  test('a missing section marks the result incomplete', () => {
    const missing = FULL.replace(/➡️ NEXT STEP[\s\S]*$/u, '');
    expect(parseAnalysisSections(missing).complete).toBe(false);
  });

  test('the non-food guard reply (two plain sentences) is incomplete, not partial', () => {
    const guard = 'I cannot identify a meal in this image. Please upload a clearer photo.';
    const p = parseAnalysisSections(guard);
    expect(p.complete).toBe(false);
    expect(p.trailing).toBe(guard);
  });

  test('empty, null and undefined are safe', () => {
    for (const v of ['', '   ', null, undefined]) {
      expect(parseAnalysisSections(v).complete).toBe(false);
    }
  });
});

describe('toShortSentence — the one-glance line', () => {
  test('returns the input untouched when it is already one short sentence', () => {
    const s = 'The creamy dressing may feel heavy.';
    expect(toShortSentence(s)).toBe(s);
  });

  test('keeps only the first sentence when the model writes several', () => {
    const long =
      'The creamy dressing may feel heavy. Dairy is a common trigger. You may want to watch this.';
    expect(toShortSentence(long)).toBe('The creamy dressing may feel heavy.');
  });

  test('a shortened result differs from the input, which is how More is triggered', () => {
    const long = 'First sentence here. Second sentence here.';
    expect(toShortSentence(long)).not.toBe(long);
  });

  test('a single very long sentence is cut at a word boundary with an ellipsis', () => {
    const runOn = `${'word '.repeat(60)}end.`;
    const out = toShortSentence(runOn);
    expect(out.length).toBeLessThanOrEqual(112);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });

  test('empty and whitespace input are safe', () => {
    for (const v of ['', '   ']) expect(toShortSentence(v)).toBe('');
  });
});

describe('end to end — a realistically verbose reply', () => {
  const VERBOSE = `🍽️ MEAL
You had some pizza with cheese and tomato, which is a fairly rich choice.

📊 SCORE
5/10 — this is a moderately heavy meal for most people, and the combination of refined flour and dairy fat is the main reason the score sits in the middle rather than higher.

⚠️ POSSIBLE SENSITIVITY
The cheese may feel heavy for you. Dairy is one of the more common triggers for bloating. You mentioned discomfort after meals, so this is worth noticing.

✅ BETTER OPTION
A thinner base with less cheese could feel lighter. You could also try a tomato-based topping instead of a creamy one.

➡️ NEXT STEP
Notice how you feel over the next few hours. If you feel heavy, note it down.`;

  const parsed = parseAnalysisSections(VERBOSE);

  test('the title is the meal alone', () => {
    expect(extractMealTitle(VERBOSE)).toBe('Pizza');
  });

  test('the score reason is one short line, not the paragraph', () => {
    const reason = extractScoreReason(VERBOSE);
    // The model wrote a 170-char single sentence; the cap is what shortens it.
    expect(parsed.score.length).toBeGreaterThan(150);
    expect(reason.length).toBeLessThanOrEqual(91);
    expect(reason).not.toContain('sits in the middle');
  });

  test('each section reduces to a single sentence on the main surface', () => {
    for (const key of ['sensitivity', 'betterOption', 'nextStep'] as const) {
      const summary = toShortSentence(parsed[key]);
      expect(summary.split(/[.!?]/).filter((s) => s.trim()).length).toBe(1);
      expect(summary.length).toBeLessThanOrEqual(112);
    }
  });

  test('nothing the model wrote is lost — the remainder is still available', () => {
    for (const key of ['sensitivity', 'betterOption'] as const) {
      // Shortened, therefore disclosed under More rather than dropped.
      expect(toShortSentence(parsed[key])).not.toBe(parsed[key]);
      expect(parsed[key].length).toBeGreaterThan(toShortSentence(parsed[key]).length);
    }
  });
});

describe('shared meal-log payload', () => {
  const base = {
    userId: 'u1',
    mealName: 'Chicken salad',
    mealType: 'lunch' as const,
    note: 'analysis text',
  };

  test('omits client_uuid when none is given — preserves the existing insert', () => {
    expect(buildFoodLogPayload(base)).not.toHaveProperty('client_uuid');
  });

  test('includes client_uuid when given — enables the upsert', () => {
    expect(buildFoodLogPayload({ ...base, clientUuid: 'k1' }).client_uuid).toBe('k1');
  });

  test('truncates to the column limits', () => {
    const p = buildFoodLogPayload({ ...base, mealName: 'x'.repeat(400), note: 'y'.repeat(900) });
    expect((p.meal_name as string).length).toBe(200);
    expect((p.note as string).length).toBe(600);
  });
});

describe('onboarding Continue — auto-log', () => {
  const fn = PHOTO.slice(
    PHOTO.indexOf('const handleOnboardingContinue'),
    PHOTO.indexOf('const handleOnboardingSkipForNow'),
  );

  test('is guarded against a double tap', () => {
    expect(fn).toContain('if (continuingRef.current) return;');
    expect(fn).toContain('continuingRef.current = true;');
  });

  test('persists the meal through the shared path, not the button handler', () => {
    expect(fn).toContain('saveMealLog({');
    expect(fn).not.toContain('handleLogPhotoAnalysis');
  });

  test('uses the stable per-result key so repeats collapse to one row', () => {
    expect(fn).toContain('clientUuid: onboardingLogKeyRef.current');
    // Minted once when the analysis succeeds — not per tap.
    expect(PHOTO).toContain('onboardingLogKeyRef.current = `onboarding-');
    expect(fn).not.toContain('Date.now()');
  });

  test('a save failure is reported but never blocks onboarding', () => {
    expect(fn).toContain('Sentry.captureException');
    const failAt = fn.indexOf('Sentry.captureException');
    const routeAt = fn.indexOf("router.replace('/(onboarding)/notifications')");
    expect(failAt).toBeGreaterThan(-1);
    expect(routeAt).toBeGreaterThan(failAt);
  });

  test('saves, then advances the stage, then routes — in that order', () => {
    expect(fn.indexOf('saveMealLog(')).toBeLessThan(fn.indexOf("persistStage('notifications'"));
    expect(fn.indexOf("persistStage('notifications'")).toBeLessThan(
      fn.indexOf("router.replace('/(onboarding)/notifications')"),
    );
  });

  test('the success analytics event is untouched by this path', () => {
    expect(fn).not.toContain('FIRST_ANALYSIS_COMPLETED');
  });
});

describe('normal analysis is unchanged', () => {
  test('the Log meal button keeps its spinner and toasts', () => {
    expect(PHOTO).toContain('setIsLoggingMeal(true)');
    expect(PHOTO).toContain('t.photoAnalysis.logMealSuccess');
    expect(PHOTO).toContain('t.photoAnalysis.logMealOffline');
    expect(PHOTO).toContain('t.photoAnalysis.logMealFailed');
  });

  test('the manual button does NOT dedupe — two taps remain two meals', () => {
    const btn = PHOTO.slice(
      PHOTO.indexOf('const handleLogPhotoAnalysis'),
      PHOTO.indexOf('const handleOnboardingContinue'),
    );
    expect(btn).toContain('saveMealLog({');
    expect(btn).not.toContain('clientUuid');
  });

  test('the full result surface still renders for normal analysis', () => {
    expect(PHOTO).toContain('wizardStep === 3 && !isOnboarding');
    for (const marker of ['resultActionsRow', 'accuracySectionCard', 'newScanText', 'shareButton']) {
      expect(PHOTO).toContain(marker);
    }
  });

  test('the concise surface is gated to onboarding only', () => {
    expect(PHOTO).toContain('wizardStep === 3 && isOnboarding');
    expect(PHOTO).toContain('<AnalysisResult');
  });

  test('the normal footer row is untouched by the pinned onboarding footer', () => {
    expect(PHOTO).toContain('styles.wizardFooterRow');
    // The pinned bar is a distinct style, so the normal in-flow row cannot be
    // restyled by accident.
    expect(PHOTO).toContain('styles.onboardingFooter');
    expect(PHOTO.match(/styles\.wizardFooterRow/g)).toHaveLength(1);
  });
});

describe('pinned Continue', () => {
  test('renders outside the ScrollView, after it closes', () => {
    const lastScrollClose = PHOTO.lastIndexOf('</ScrollView>');
    const continueAt = PHOTO.indexOf('void handleOnboardingContinue()');
    expect(lastScrollClose).toBeGreaterThan(-1);
    expect(continueAt).toBeGreaterThan(lastScrollClose);
  });

  test('there is exactly one Continue — the old in-scroll copy is gone', () => {
    expect(PHOTO.match(/void handleOnboardingContinue\(\)/g)).toHaveLength(1);
  });

  test('the pinned bar is gated to onboarding and clears the home indicator', () => {
    const bar = PHOTO.slice(PHOTO.lastIndexOf('</ScrollView>'));
    expect(bar).toContain('wizardStep === 3 && isOnboarding');
    expect(bar).toContain('insets.bottom');
  });
});

describe('More detail carries only genuinely additional content', () => {
  const more = PHOTO.slice(
    PHOTO.indexOf('const onboardingMoreContent'),
    PHOTO.indexOf('const onboardingSafetyNotice'),
  );

  test('it never re-renders the raw analysis', () => {
    expect(more).not.toContain('sanitizeAnalysisForDisplay(analysis)');
    expect(more).not.toContain('{raw}');
  });

  test('it never repeats a parsed section', () => {
    for (const key of ['sensitivity', 'betterOption', 'nextStep', '.score', '.meal']) {
      expect(more).not.toContain(`onboardingSections${key}`);
    }
  });

  test('it is undefined when there is nothing extra, so More disappears', () => {
    expect(more).toContain(') : undefined;');
    expect(more).toContain('onboardingProfileLine || onboardingSections.preamble || onboardingPlanB');
  });

  test('it carries profile context, the preamble and Plan B', () => {
    expect(more).toContain('onboardingProfileLine');
    expect(more).toContain('onboardingSections.preamble');
    expect(more).toContain('onboardingPlanB');
  });

  test('the parse happens once and is shared with the component', () => {
    expect(PHOTO).toContain('sections={onboardingSections}');
    expect(PHOTO.match(/parseAnalysisSections\(/g)).toHaveLength(1);
  });
});

describe('safety-critical content is not hidden behind More', () => {
  test('instant relief is passed as an always-visible notice, not as More', () => {
    expect(PHOTO).toContain('const onboardingSafetyNotice = hasPainSymptom ?');
    expect(PHOTO).toContain('safetyNotice={onboardingSafetyNotice}');
    const more = PHOTO.slice(
      PHOTO.indexOf('const onboardingMoreContent'),
      PHOTO.indexOf('const onboardingSafetyNotice'),
    );
    expect(more).not.toContain('instantRelief');
  });

  test('it uses the same copy the normal result shows', () => {
    expect(PHOTO).toContain('t.photoAnalysis.instantReliefTitle');
    expect(PHOTO).toContain('t.photoAnalysis.instantReliefText');
  });
});

describe('concise result presentation', () => {
  test('falls back to the raw text when parsing is incomplete', () => {
    expect(RESULT).toContain('sections.complete ?');
    expect(RESULT).toContain('{raw}');
  });

  test('the disclaimer is outside the collapsible region', () => {
    expect(RESULT.indexOf('showMore ?')).toBeLessThan(RESULT.indexOf('disclaimerRow'));
  });

  test('More is suppressed entirely when there is nothing extra to show', () => {
    // No shortened section and no caller content -> no Pressable, no chevron,
    // no empty panel.
    expect(RESULT).toContain('Boolean(moreContent)');
    expect(RESULT).toContain('{showMore ? (');
  });

  test('More can never appear on the raw fallback path, where it would duplicate', () => {
    expect(RESULT).toContain(
      'const showMore = sections.complete && (detailRows.length > 0 || Boolean(moreContent));',
    );
  });

  test('the main surface shows one sentence per section, not the full body', () => {
    expect(RESULT).toContain('const summary = toShortSentence(r.body);');
    expect(RESULT).toContain('{row.summary}');
    // The full body must not be rendered in the section card.
    const card = RESULT.slice(RESULT.indexOf('styles.sectionCard'), RESULT.indexOf('styles.rawText'));
    expect(card).not.toContain('{row.body}');
  });

  test('the detail that was trimmed is inside More, not discarded', () => {
    expect(RESULT).toContain("hasDetail: summary !== r.body.trim()");
    expect(RESULT).toContain('const detailRows = rows.filter((r) => r.hasDetail);');
    // Rendered under the disclosure, with the full text.
    const more = RESULT.slice(RESULT.indexOf('styles.moreBody'), RESULT.indexOf('disclaimerRow'));
    expect(more).toContain('{row.body}');
  });

  test('the safety notice renders above More and is never collapsible', () => {
    const noticeAt = RESULT.indexOf('{safetyNotice ?? null}');
    expect(noticeAt).toBeGreaterThan(-1);
    expect(noticeAt).toBeLessThan(RESULT.indexOf('{showMore ? ('));
    // It is rendered directly, not passed through the expanded branch.
    expect(RESULT).not.toContain('expanded ? safetyNotice');
  });

  test('More is a button exposing its expanded state', () => {
    expect(RESULT).toContain('accessibilityRole="button"');
    expect(RESULT).toContain('accessibilityState={{ expanded }}');
  });

  test('More expands inline rather than opening a modal', () => {
    expect(RESULT).not.toContain('Modal');
  });

  test('section titles are headings for VoiceOver', () => {
    expect(RESULT).toContain('accessibilityRole="header"');
  });

  test('the photo carries an accessibility label', () => {
    expect(RESULT).toContain('accessibilityLabel={t.analysisResult.photoAlt}');
  });

  test('it renders no actions of its own — Continue is the screen\'s job', () => {
    for (const banned of ['logMeal', 'shareButton', 'copyResult', 'newScan', 'isThisAccurate']) {
      expect(RESULT).not.toContain(banned);
    }
  });

  test('it performs no persistence, navigation or AI call', () => {
    for (const banned of ['supabase', 'router.', 'analyzeMealPhoto', 'saveMealLog']) {
      expect(RESULT).not.toContain(banned);
    }
  });
});

describe('the Generate Analysis button paints the state it is actually in', () => {
  // The disabled prop and the disabled style used to be two copies of one
  // condition, and the style copy always required an image. On the text-only
  // path — the permanent free-tier route — the button was tappable but drawn
  // with the disabled colour at 0.55 opacity, so it read as dead.
  const BUTTON = PHOTO.slice(
    PHOTO.indexOf('onPress={handleGenerateAnalysis}'),
    PHOTO.indexOf('onPress={handleGenerateAnalysis}') + 1200,
  );

  test('the disabled style is driven by analyzeDisabled, not a restatement', () => {
    expect(BUTTON).toContain('analyzeDisabled && styles.analyzeCombinedButtonDisabled');
    expect(BUTTON).toContain('pressed && !analyzeDisabled && styles.pressed');
  });

  test('no copy of the enablement condition survives in the style prop', () => {
    const styleProp = BUTTON.slice(BUTTON.indexOf('style={({ pressed })'), BUTTON.indexOf(']}'));
    for (const fragment of ['mealDescription.trim()', 'lastImageBase64.trim()', 'isAnalyzing']) {
      expect(`${fragment} in style: ${styleProp.includes(fragment)}`).toBe(
        `${fragment} in style: false`,
      );
    }
  });

  test('the disabled prop and accessibility state still read the same source', () => {
    expect(BUTTON).toContain('disabled={analyzeDisabled}');
    expect(BUTTON).toContain('accessibilityState={{ disabled: analyzeDisabled }}');
  });

  test('enabled and disabled remain visually distinct', () => {
    // A fix that made the two states identical would also "pass" the above.
    expect(PHOTO).toMatch(/analyzeCombinedButtonDisabled:\s*\{[^}]*backgroundColor/);
    expect(PHOTO).toMatch(/analyzeCombinedButtonDisabled:\s*\{[^}]*opacity/);
  });
});
