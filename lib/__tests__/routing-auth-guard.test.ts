/**
 * Routing decision tests.
 *
 * These import the SAME functions app/_layout.tsx and app/index.tsx use
 * (lib/routing.ts), so a regression in the shipped routing rules fails here.
 * An earlier version of this file re-implemented the rules locally, which
 * meant it could pass while the app itself was broken.
 */

import { authGuardDecision, indexDecision, PROTECTED_SEGMENTS } from '../routing';

describe('authGuardDecision (_layout.tsx guard)', () => {
  test('stays put while auth is still loading', () => {
    expect(authGuardDecision({ session: false, loading: true, segments: ['(tabs)'] })).toBe('stay');
  });

  test('sends an unauthenticated user out of every protected screen', () => {
    for (const segment of PROTECTED_SEGMENTS) {
      expect(authGuardDecision({ session: false, loading: false, segments: [segment] })).toBe(
        'welcome'
      );
    }
  });

  test('leaves an unauthenticated user alone in (auth)', () => {
    expect(
      authGuardDecision({ session: false, loading: false, segments: ['(auth)', 'login'] })
    ).toBe('stay');
  });

  test('leaves an unauthenticated user alone in (onboarding) — Welcome stays reachable', () => {
    expect(
      authGuardDecision({ session: false, loading: false, segments: ['(onboarding)', 'welcome'] })
    ).toBe('stay');
  });

  test('restores a valid session into tabs without redirecting', () => {
    expect(authGuardDecision({ session: true, loading: false, segments: ['(tabs)'] })).toBe('stay');
  });

  test('pins a password-recovery session to the New Password screen', () => {
    expect(
      authGuardDecision({
        session: true,
        loading: false,
        segments: ['(tabs)'],
        passwordRecovery: true,
      })
    ).toBe('reset-password');
  });

  test('lets a password-recovery session stay on the New Password screen', () => {
    expect(
      authGuardDecision({
        session: true,
        loading: false,
        segments: ['(auth)', 'reset-password'],
        passwordRecovery: true,
      })
    ).toBe('stay');
  });

  test('does not redirect on an empty segment list', () => {
    expect(authGuardDecision({ session: false, loading: false, segments: [] })).toBe('stay');
  });
});

describe('indexDecision (app entry)', () => {
  test('waits while loading', () => {
    expect(indexDecision({ session: false, loading: true, onboardingCompleted: null })).toBe(
      'loading'
    );
  });

  test('sends an unauthenticated cold start to Welcome', () => {
    expect(indexDecision({ session: false, loading: false, onboardingCompleted: null })).toBe(
      '(onboarding)/welcome'
    );
  });

  test('resumes onboarding when the profile says it is incomplete', () => {
    expect(indexDecision({ session: true, loading: false, onboardingCompleted: false })).toBe(
      '(onboarding)/questions'
    );
  });

  test('restores a valid, onboarded session into tabs', () => {
    expect(indexDecision({ session: true, loading: false, onboardingCompleted: true })).toBe(
      '(tabs)'
    );
  });

  test('lets a session in without a loaded profile rather than stranding it', () => {
    expect(indexDecision({ session: true, loading: false, onboardingCompleted: null })).toBe(
      '(tabs)'
    );
  });

  test('routes a password-recovery session to the New Password screen, not the app', () => {
    expect(
      indexDecision({
        session: true,
        loading: false,
        onboardingCompleted: true,
        passwordRecovery: true,
      })
    ).toBe('(auth)/reset-password');
  });
});
