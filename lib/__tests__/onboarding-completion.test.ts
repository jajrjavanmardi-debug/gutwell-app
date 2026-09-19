/**
 * Phase 5 — onboarding completion.
 *
 * The screen is too entangled to render in jest, so the properties that matter
 * are asserted structurally over its source: that the system permission prompt
 * cannot fire on mount, that Allow and Skip both complete, that no write
 * failure can trap the user, and that the retired `onboarding_name` read is
 * gone. Routing finalisation is exercised through the real decision function.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { indexDecision } from '../routing';
import { resolveStage, PRE_SIGNUP_STAGES } from '../onboarding-stage';
import { translations } from '../i18n';

const RAW = readFileSync(
  join(__dirname, '..', '..', 'app', '(onboarding)', 'notifications.tsx'),
  'utf8',
);

/**
 * Comments stripped. The screen's own prose names the things it must not do
 * ("the old onboarding_name read", "answers.avoid stays local"), so assertions
 * about absent code have to read code only — otherwise they fail on the
 * documentation that explains why the code is absent.
 */
const NOTIF = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const en = translations.en;
const de = translations.de;

/** The completion function body, isolated. */
const completionFn = NOTIF.slice(
  NOTIF.indexOf('const completeOnboardingFlow'),
  NOTIF.indexOf('const requestPermission'),
);

/** The Allow handler body. */
const allowFn = NOTIF.slice(
  NOTIF.indexOf('const requestPermission'),
  NOTIF.indexOf('return (', NOTIF.indexOf('const requestPermission')),
);

function route(params: {
  session: boolean;
  onboardingCompleted: boolean | null;
  serverStage?: unknown;
  localStage?: unknown;
}) {
  return indexDecision({
    session: params.session,
    loading: false,
    onboardingCompleted: params.onboardingCompleted,
    stage: resolveStage({
      authenticated: params.session,
      serverStage: params.serverStage ?? null,
      localStage: params.localStage ?? null,
    }),
    stageReady: true,
  });
}

describe('the old name source is gone', () => {
  test('no onboarding_name read remains', () => {
    expect(NOTIF).not.toContain('onboarding_name');
  });

  test('the screen no longer writes display_name at all', () => {
    // handle_new_user copies it from the signup metadata, so signup is the one
    // and only source. Writing it here again would recreate the competing field.
    expect(completionFn).not.toContain('display_name');
  });
});

describe('no system prompt before an explicit Allow', () => {
  test('the permission request lives only in the Allow handler', () => {
    expect(NOTIF).toContain('const requestPermission = async () => {');
    expect(NOTIF.match(/requestPermissions\(\)/g)).toHaveLength(1);
  });

  test('no effect on mount requests permission', () => {
    // The only useEffect in the screen animates the button in; asserting the
    // request is absent from every effect body is what keeps the one-shot iOS
    // prompt from being spent before the user chooses.
    const effects = NOTIF.split('useEffect(').slice(1);
    for (const body of effects) {
      expect(body.slice(0, 600)).not.toContain('requestPermissions');
    }
  });

  test('Skip never reaches the permission request or the scheduler', () => {
    const skipHandler = 'onPress={() => void completeOnboardingFlow()}';
    expect(NOTIF).toContain(skipHandler);
    expect(completionFn).not.toContain('requestPermissions');
    expect(completionFn).not.toContain('scheduleDailyCheckInReminder');
    expect(completionFn).not.toContain('scheduleWeeklyDigestNotification');
  });
});

describe('Allow and Skip both complete onboarding', () => {
  test('Allow completes regardless of the permission outcome', () => {
    // completion sits outside the try/catch, so granted, denied and thrown all
    // converge on the same call.
    expect(allowFn).toContain('completeOnboardingFlow()');
    expect(allowFn).toContain('catch');
    expect(allowFn.indexOf('catch')).toBeLessThan(allowFn.indexOf('completeOnboardingFlow()'));
  });

  test('scheduling happens only when permission was granted', () => {
    expect(allowFn).toContain('if (granted) {');
    expect(allowFn.indexOf('if (granted) {')).toBeLessThan(
      allowFn.indexOf('scheduleDailyCheckInReminder'),
    );
  });

  test('both paths call the same completion function', () => {
    expect(NOTIF.match(/completeOnboardingFlow\(\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('completion writes and idempotency', () => {
  test('sets the completed flag and the terminal stage in one write', () => {
    expect(completionFn).toContain('onboarding_completed: true');
    expect(completionFn).toContain("onboarding_stage: 'completed'");
  });

  test('writes the local stage too, before the network call', () => {
    expect(completionFn).toContain("saveLocalStage('completed')");
    expect(completionFn.indexOf("saveLocalStage('completed')")).toBeLessThan(
      completionFn.indexOf("from('profiles')"),
    );
  });

  test('repeated taps are guarded', () => {
    expect(completionFn).toContain('if (completingRef.current) return;');
    expect(completionFn).toContain('completingRef.current = true;');
  });

  test('a failed profile write still routes the user Home', () => {
    expect(completionFn).toContain('catch (error)');
    const catchBlock = completionFn.slice(completionFn.indexOf('catch (error)'));
    expect(catchBlock).toContain("router.replace('/(tabs)')");
  });

  test('the user is never left on this screen', () => {
    // Every terminal path navigates: success, failure, and the no-user guard.
    expect(completionFn.match(/router\.replace/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe('legacy profile writes', () => {
  test('goal, gut_concern and symptom_frequency are still written', () => {
    // gut_concern is now serialised from the multi-select array (see
    // feeling-multiselect.test.ts) rather than read straight off the blob, but
    // it is still the same column written from the same answer key.
    expect(completionFn).toContain('gut_concern: gutConcern');
    expect(completionFn).toContain("feelings.join(', ')");
    expect(completionFn).toContain('symptom_frequency:');
    expect(completionFn).toContain('bloating_frequency');
    expect(completionFn).toContain('goal:');
    expect(completionFn).toContain('answers.goal');
  });

  test('symptom_frequency resolves to null without inventing a value', () => {
    // v1.0 no longer asks the question that fed bloating_frequency. Null is the
    // honest result; nothing back-fills it with a string.
    expect(completionFn).toMatch(/bloating_frequency[^;]*\?\?\s*null/);
    expect(completionFn).not.toMatch(/bloating_frequency[^;]*\?\?\s*['"][A-Za-z]/);
  });

  test('avoid-food chips are never written to the database', () => {
    expect(completionFn).not.toContain('avoid:');
    expect(completionFn).not.toContain('answers.avoid');
  });
});

describe('notification copy', () => {
  test('asks about a reminder, in both languages', () => {
    expect(en.notifications.subtitle).toContain('reminder to log another meal tomorrow');
    expect(de.notifications.subtitle).toContain(
      'morgen daran erinnert werden, eine weitere Mahlzeit zu erfassen',
    );
  });

  test('references the analysis that just happened, not a check-in', () => {
    expect(en.notifications.title.toLowerCase()).toContain('analysis');
    expect(de.notifications.title.toLowerCase()).toContain('analyse');
  });

  test('offers a skip and uses no pressure or requirement language', () => {
    expect(en.notifications.skipButton).toBeTruthy();
    const copy = [en.notifications.title, en.notifications.subtitle, en.notifications.skipButton]
      .join(' ')
      .toLowerCase();
    for (const banned of ['required', 'must ', 'you need to', 'don\'t miss out']) {
      expect(copy).not.toContain(banned);
    }
  });
});

describe('routing finalisation', () => {
  test('authenticated + incomplete + missing stage resumes at the first analysis', () => {
    expect(route({ session: true, onboardingCompleted: false })).toBe('photo-analysis-onboarding');
  });

  test('authenticated + incomplete + unknown stage resumes at the first analysis', () => {
    expect(route({ session: true, onboardingCompleted: false, serverStage: 'quiz' })).toBe(
      'photo-analysis-onboarding',
    );
  });

  test('authenticated + incomplete + stale pre-signup stage resumes at the first analysis', () => {
    for (const stage of PRE_SIGNUP_STAGES) {
      expect(route({ session: true, onboardingCompleted: false, serverStage: stage })).toBe(
        'photo-analysis-onboarding',
      );
    }
  });

  test('it never sends an authenticated user back to the questionnaire', () => {
    for (const stage of [null, 'quiz', 'goal', 'feeling', 'example', 'signup', 'analysis']) {
      expect(route({ session: true, onboardingCompleted: false, serverStage: stage })).not.toBe(
        '(onboarding)/questions',
      );
    }
  });

  test('a completed user with a stale stage still reaches tabs', () => {
    for (const stale of ['analysis', 'notifications', 'goal', 'quiz', null]) {
      expect(route({ session: true, onboardingCompleted: true, serverStage: stale })).toBe('(tabs)');
    }
  });

  test('an unauthenticated user with no stage still starts at Welcome', () => {
    expect(route({ session: false, onboardingCompleted: null })).toBe('(onboarding)/welcome');
  });

  test('unauthenticated resume points are unaffected', () => {
    expect(route({ session: false, onboardingCompleted: null, localStage: 'goal' })).toBe(
      '(onboarding)/questions',
    );
    expect(route({ session: false, onboardingCompleted: null, localStage: 'example' })).toBe(
      '(onboarding)/example',
    );
  });

  test('password recovery still wins over everything', () => {
    expect(
      indexDecision({
        session: true,
        loading: false,
        onboardingCompleted: false,
        stage: 'analysis',
        passwordRecovery: true,
      }),
    ).toBe('(auth)/reset-password');
  });
});
