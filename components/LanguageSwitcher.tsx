/**
 * components/LanguageSwitcher.tsx
 *
 * Compact language control for the pre-signup onboarding screens: Welcome, the
 * two question steps, and the example analysis.
 *
 * Extracted verbatim from the Welcome screen, which is the implementation that
 * was verified on a physical device. Behaviour, styling, sizing and the
 * accessibility treatment are unchanged — this is a move, not a redesign, so
 * Welcome cannot regress.
 *
 * Why it exists on more than one screen: a user can start onboarding in English
 * and realise on the goal or feeling step that they would rather read German.
 * Before this, the only switcher was on Welcome, so the choice meant navigating
 * back and starting over.
 *
 * ── State preservation ──────────────────────────────────────────────────────
 * Switching languages must never cost the user their answers. That is
 * guaranteed structurally rather than defensively:
 *
 *   - The only writer is useLanguage().setLanguage from lib/LanguageContext,
 *     which persists via saveLanguage() and then sets one piece of context
 *     state. This component holds NO language state of its own — a second
 *     source of truth is exactly what would let the two drift apart.
 *   - A context value change re-renders consumers; it does not remount them.
 *     Nothing in the tree is keyed on language, so questions.tsx keeps its
 *     `answers` and `index` useState, and onboarding_answers in AsyncStorage is
 *     never touched.
 *   - This component performs no navigation. onboarding_stage is not read or
 *     written here.
 *
 * ── i18n keys ───────────────────────────────────────────────────────────────
 * The copy still lives under t.welcome.* because that is where it was written
 * and where the EN/DE coverage test already guards it. Slightly odd naming for
 * a shared component, but moving the keys would mean touching two language
 * blocks for no behavioural gain, with a rename as the only thing that could go
 * wrong. Left deliberately.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { FontFamily } from '../constants/theme';
import { useTranslation } from '../lib/i18n';
import { useLanguage } from '../lib/LanguageContext';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, type AppLanguage } from '../lib/language';

/**
 * Caps how far the label can grow at accessibility text sizes.
 *
 * The chip must stay compact and visually secondary to the screen's content,
 * and its 44pt tap target is preserved independently by minHeight/minWidth, so
 * the target never shrinks. This affects this label only — no other text in the
 * app is capped, and Dynamic Type is not disabled anywhere.
 */
const CODE_MAX_FONT_SCALE = 1.3;

export default function LanguageSwitcher() {
  const t = useTranslation();
  const { language, setLanguage } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSelect = async (next: AppLanguage) => {
    setMenuOpen(false);
    if (next === language) return;
    // setLanguage persists via saveLanguage() and re-renders the tree. No
    // navigation, no answer writes — the current screen and its state stay put.
    await setLanguage(next);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.chip}
        onPress={() => setMenuOpen(true)}
        activeOpacity={0.75}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`${t.welcome.languageLabel}: ${LANGUAGE_LABELS[language]}`}
        accessibilityHint={t.welcome.accessLanguageHint}
      >
        <Ionicons name="globe-outline" size={15} color="rgba(255,255,255,0.75)" />
        {/* The full label, not the two-letter code. Device QA looked for a
            language control and did not recognise "EN" as one — the chip was
            present on Welcome all along. The switcher, its state and its
            persistence are unchanged; only what the chip reads changed. */}
        <Text style={styles.chipText} maxFontSizeMultiplier={CODE_MAX_FONT_SCALE} numberOfLines={1}>
          {LANGUAGE_LABELS[language]}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setMenuOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t.common.close}
        >
          {/* Stops a tap inside the card from dismissing the menu. */}
          <Pressable
            style={styles.menuCard}
            onPress={() => {}}
            // Keeps VoiceOver focus inside the card so the options are reached
            // before the backdrop's dismiss action.
            accessibilityViewIsModal
          >
            <Text style={styles.menuTitle}>{t.welcome.languageModalTitle}</Text>
            {SUPPORTED_LANGUAGES.map((lang, idx) => {
              const selected = lang === language;
              return (
                <TouchableOpacity
                  key={lang}
                  style={[styles.menuOption, idx > 0 && styles.menuOptionBorder]}
                  onPress={() => handleSelect(lang)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={LANGUAGE_LABELS[lang]}
                  accessibilityHint={t.welcome.accessLanguageOptionHint}
                >
                  <Text style={[styles.menuOptionText, selected && styles.menuOptionTextSelected]}>
                    {LANGUAGE_LABELS[lang]}
                  </Text>
                  {/* A checkmark, not colour alone, carries the selected state. */}
                  {selected && <Ionicons name="checkmark" size={18} color="#52B788" />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    // 44pt minimum touch target (Apple HIG) without a bulky visual footprint.
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chipText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.5,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  menuCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    backgroundColor: '#12301F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 8,
  },
  menuTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.4,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 20,
  },
  menuOptionBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  menuOptionText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
  },
  menuOptionTextSelected: {
    fontFamily: FontFamily.sansSemiBold,
    color: '#FFFFFF',
  },
});
