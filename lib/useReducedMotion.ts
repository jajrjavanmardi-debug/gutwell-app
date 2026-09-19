/**
 * lib/useReducedMotion.ts
 *
 * Reads iOS "Reduce Motion" (Settings › Accessibility › Motion) and keeps
 * following it while the app runs.
 *
 * First use of AccessibilityInfo in this codebase, so it is written as a hook
 * rather than a one-off read: every animated surface added from here on should
 * gate on the same source, and a second implementation is exactly what would
 * let two surfaces disagree.
 *
 * Two properties matter and are easy to get wrong:
 *
 *   - It listens. A user who turns Reduce Motion on while the app is
 *     foregrounded must see it take effect without relaunching. A plain
 *     `isReduceMotionEnabled()` on mount would silently fail that.
 *   - It fails closed to `false` — motion allowed. If the query rejects (it
 *     can on some platforms), the animated path is the one that has been
 *     tested; refusing to animate on an unrelated error would be a worse
 *     default than the ordinary experience.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduced(enabled);
      })
      .catch(() => {
        // Leave the default. See the failure note above.
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => setReduced(enabled),
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

export default useReducedMotion;
