/**
 * components/AnalysisResult.tsx
 *
 * The concise first-result presentation used by onboarding.
 *
 * Presentation only. It receives an already-parsed analysis and renders it —
 * no AI call, no persistence, no navigation. The normal in-app result is
 * deliberately untouched and still renders its own full surface in
 * photo-analysis.tsx.
 *
 * Why it exists: the first result showed thirteen blocks and six competing
 * actions at once. The analysis was strong; the hierarchy buried it. Here the
 * headline result is legible in seconds and the detail is one tap away.
 *
 * "Pictures explain, text confirms" — the photo and score lead, each section is
 * one short sentence from the model, and nothing is rewritten or summarised by
 * the app.
 *
 * Fail-safe: when the parser could not find all five sections the caller passes
 * `raw`, and the untouched analysis text is rendered instead. Content is never
 * dropped.
 */
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { FontFamily } from '../constants/theme';
import { useTranslation } from '../lib/i18n';
import { toShortSentence, type ParsedAnalysis } from '../lib/analysis-sections';

export type AnalysisResultProps = {
  photoUri: string | null;
  /** Meal name from the existing extractor. */
  mealName: string;
  /** Impact score, e.g. "7/10". */
  score: string | null;
  /** One-line reason from the existing extractor. */
  scoreReason: string;
  sections: ParsedAnalysis;
  /** Raw analysis, rendered verbatim when sections.complete is false. */
  raw: string;
  /**
   * Safety-relevant content that must never be collapsed — e.g. the instant
   * relief guidance shown when the user reported pain. Rendered above the
   * disclaimer, always visible.
   */
  safetyNotice?: React.ReactNode;
  /**
   * Extra detail revealed by "More". Must contain ONLY things the concise
   * surface does not already show. Passing the raw analysis here would make
   * the disclosure a duplicate of the sections above it, so callers pass
   * undefined when they have nothing genuinely additional — the affordance
   * then disappears rather than opening onto a repeat.
   */
  moreContent?: React.ReactNode;
  /**
   * "What GutWell considered" — rendered between the score and the sections,
   * because that is where a reader asks "why this answer?". Optional: a
   * caller with no context to show passes nothing and the block disappears
   * rather than rendering an empty card.
   */
  contextSummary?: React.ReactNode;
  /**
   * Short line under the score naming what the number is. Optional so the
   * component stays usable without it.
   */
  scoreLabel?: string;
  scoreNote?: string;
  /**
   * Whether to render the built-in disclaimer.
   *
   * Defaults to true, so every existing caller is unchanged. The in-app
   * result screen sets it false because it already renders the fuller
   * `photoAnalysis.medicalDisclaimer` at the end of its own surface — two
   * disclaimers on one screen reads as a bug, and the longer one is the
   * established legal copy.
   */
  showDisclaimer?: boolean;
};

export default function AnalysisResult({
  photoUri,
  mealName,
  score,
  scoreReason,
  sections,
  raw,
  safetyNotice,
  moreContent,
  contextSummary,
  scoreLabel,
  scoreNote,
  showDisclaimer = true,
}: AnalysisResultProps) {
  const t = useTranslation();
  const [expanded, setExpanded] = useState(false);

  /**
   * Each section twice: the line that goes on screen, and the full text.
   *
   * The main surface shows only `summary` — one sentence per section. Anything
   * the model wrote beyond that is real content, not noise, so it is disclosed
   * under "More" rather than discarded. `hasDetail` is simply whether the two
   * differ, which means the affordance appears only when it has something to
   * reveal.
   */
  const rows = [
    { key: 'sensitivity', icon: 'alert-circle-outline' as const, title: t.analysisResult.sensitivity, body: sections.sensitivity },
    { key: 'betterOption', icon: 'leaf-outline' as const, title: t.analysisResult.betterOption, body: sections.betterOption },
    { key: 'nextStep', icon: 'footsteps-outline' as const, title: t.analysisResult.nextStep, body: sections.nextStep },
  ]
    .filter((r) => r.body)
    .map((r) => {
      const summary = toShortSentence(r.body);
      return { ...r, summary, hasDetail: summary !== r.body.trim() };
    });

  const detailRows = rows.filter((r) => r.hasDetail);

  // In the fallback path the raw reply is already on screen in full, so there
  // is by definition nothing More could add. Enforced here as well as at the
  // caller so no future caller can reintroduce a duplicate disclosure.
  const showMore = sections.complete && (detailRows.length > 0 || Boolean(moreContent));

  return (
    <View style={styles.container}>
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={styles.photo}
          accessibilityRole="image"
          accessibilityLabel={t.analysisResult.photoAlt}
        />
      ) : null}

      {mealName ? (
        <Text style={styles.mealName} accessibilityRole="header">
          {mealName}
        </Text>
      ) : null}

      {score ? (
        <View
          style={styles.scoreBlock}
          accessible
          /* "7 out of 10" rather than "7/10": VoiceOver reads the slash as
             punctuation, so the scale was lost. The label also names WHICH
             score this is, because the app has two. */
          accessibilityLabel={[
            scoreLabel,
            score.replace('/', ' out of '),
            scoreReason,
          ]
            .filter(Boolean)
            .join('. ')}
        >
          <View style={styles.scoreRow}>
            <View style={styles.scorePill}>
              <Text style={styles.scoreValue}>{score}</Text>
            </View>
            <View style={styles.scoreTextBlock}>
              {/* Names the number. Without it this reads as "the" score, and
                  the app already has a different one on Home and Progress. */}
              {scoreLabel ? <Text style={styles.scoreLabel}>{scoreLabel}</Text> : null}
              {scoreReason ? <Text style={styles.scoreReason}>{scoreReason}</Text> : null}
            </View>
          </View>
          {scoreNote ? <Text style={styles.scoreNote}>{scoreNote}</Text> : null}
        </View>
      ) : null}

      {/* Position 3: what the analysis had to work with, before what it
          concluded. */}
      {contextSummary ?? null}

      {sections.complete ? (
        <View style={styles.sections}>
          {rows.map((row) => (
            <View key={row.key} style={styles.sectionCard} accessible>
              <View style={styles.sectionHeader}>
                {/* Decorative — the title carries the meaning, so nothing
                    depends on the icon or its colour. */}
                <Ionicons name={row.icon} size={17} color="#52B788" />
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  {row.title}
                </Text>
              </View>
              {/* One sentence. The remainder, if any, is under More. */}
              <Text style={styles.sectionBody}>{row.summary}</Text>
            </View>
          ))}
        </View>
      ) : (
        // Parser could not find all five sections — render the model's reply
        // exactly as it came back rather than showing a partial result.
        <Text style={styles.rawText}>{raw}</Text>
      )}

      {/* Above More, and never inside it: safety guidance must not depend on
          the user opening a disclosure. */}
      {safetyNotice ?? null}

      {showMore ? (
        <>
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={t.analysisResult.moreDetail}
            style={({ pressed }) => [styles.moreRow, pressed && styles.pressed]}
          >
            <Text style={styles.moreText}>{t.analysisResult.moreDetail}</Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="rgba(255,255,255,0.7)" />
          </Pressable>
          {/* Expands inline — a modal on a 375pt screen would hide the result
              the detail refers to. */}
          {expanded ? (
            <View style={styles.moreBody}>
              {/* The full text of every section the summary above shortened.
                  Repeating the heading is deliberate: it tells the reader which
                  line they are seeing expanded. */}
              {detailRows.map((row) => (
                <View key={row.key} style={styles.detailBlock}>
                  <Text style={styles.detailTitle} accessibilityRole="header">
                    {row.title}
                  </Text>
                  <Text style={styles.detailBody}>{row.body}</Text>
                </View>
              ))}
              {moreContent}
            </View>
          ) : null}
        </>
      ) : null}

      {/* Always visible and never inside More: it is the compliance line, and
          it sits before the actions in reading order. Suppressed only when the
          caller renders its own — never suppressed to save space. */}
      {showDisclaimer ? (
      <View style={styles.disclaimerRow}>
        <Ionicons name="shield-checkmark-outline" size={15} color="rgba(255,255,255,0.5)" />
        <Text style={styles.disclaimer}>{t.analysisResult.disclaimer}</Text>
      </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)' },
  mealName: { fontFamily: FontFamily.sansSemiBold, fontSize: 20, color: '#FFFFFF' },

  scoreBlock: { gap: 6 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreTextBlock: { flex: 1, flexShrink: 1, gap: 2 },
  scoreLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  // Provenance for the number: AI-generated, contextual, not a measurement.
  scoreNote: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.5)',
  },
  scorePill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(82,183,136,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(82,183,136,0.45)',
  },
  scoreValue: { fontFamily: FontFamily.sansBold, fontSize: 18, color: '#52B788' },
  // flexShrink so a long German reason wraps instead of clipping at 375pt.
  scoreReason: { fontFamily: FontFamily.sansRegular, fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.75)', flexShrink: 1 },

  sections: { gap: 12 },
  sectionCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sectionTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#52B788',
    flexShrink: 1,
  },
  sectionBody: { fontFamily: FontFamily.sansRegular, fontSize: 16, lineHeight: 23, color: '#FFFFFF' },

  rawText: { fontFamily: FontFamily.sansRegular, fontSize: 15, lineHeight: 22, color: '#FFFFFF' },

  moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  moreText: { fontFamily: FontFamily.sansMedium, fontSize: 15, color: 'rgba(255,255,255,0.7)' },
  moreBody: { gap: 14 },
  detailBlock: { gap: 4 },
  detailTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
  },
  detailBody: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.85)',
  },
  pressed: { opacity: 0.7 },

  disclaimerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  disclaimer: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.5)',
    flexShrink: 1,
  },
});
