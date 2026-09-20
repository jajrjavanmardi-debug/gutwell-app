/**
 * lib/analysis-sections.ts
 *
 * Splits an analyze-food result into its five sections.
 *
 * The Edge Function already mandates a strict contract — "Use exactly the 5
 * section labels listed below. Do not add, remove, or rename sections", one
 * short sentence each — but the app rendered the whole reply as a single block
 * of text, so that structure was thrown away at the last step. This recovers it
 * for presentation only. Nothing about the request, the prompt or the response
 * changes.
 *
 * The labels are fixed English with emoji prefixes even when the body is
 * German, so the delimiters are language-independent and the parser needs no
 * localisation.
 *
 * Fail-safe by design: if any section is missing — prompt drift, a truncated
 * reply, the non-food guard path that deliberately returns two plain sentences
 * — `complete` is false and the caller renders the raw text unchanged. Content
 * is never silently dropped, and the worst case is exactly today's behaviour.
 */

export type AnalysisSectionKey = 'meal' | 'score' | 'sensitivity' | 'betterOption' | 'nextStep';

/**
 * The one-glance version of a section body.
 *
 * The Edge Function asks for one short sentence per section, and in practice
 * returns two or three. Rendering all of them turns the concise result back
 * into the wall of text it was meant to replace, so the summary line is the
 * first sentence and the rest moves into "More".
 *
 * Returns the input unchanged when it is already short enough, which is how
 * the caller knows whether there is any detail worth disclosing.
 */
export function toShortSentence(text: string, maxChars = 110): string {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return '';

  // First sentence, if there is a clear break. Abbreviations are not a concern
  // here: the model writes plain prose, not citations.
  const match = trimmed.match(/^[^.!?]+[.!?]/);
  const first = match ? match[0].trim() : trimmed;
  if (first.length <= maxChars) {
    // Equal to the input means nothing was withheld.
    return first === trimmed ? trimmed : first;
  }

  // Prefer a clause break to a hard cut. The model often writes one long
  // sentence with no internal full stop, and "…heavy for most people." reads
  // like a finished thought where "…the refined flour with dairy fat is…"
  // reads like the text was severed.
  const clause = first.match(/^(.{24,}?)(?=,\s+(?:and|but|which|so|because|although|though)\b|,\s|;\s|\s[—–]\s)/);
  if (clause && clause[1].length <= maxChars) {
    return `${clause[1].replace(/[,;:\s]+$/, '')}.`;
  }

  const cut = first.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\s]+$/, '')}…`;
}

export type ParsedAnalysis = {
  meal: string;
  score: string;
  sensitivity: string;
  betterOption: string;
  nextStep: string;
  /**
   * Anything the model emitted before the first heading. Empty in a
   * well-formed reply, but it must be captured: it is the one part of a
   * *complete* result that no section body would otherwise contain, and the
   * caller shows it rather than dropping it.
   */
  preamble: string;
  /** Text after the last known section (safety footer etc.). */
  trailing: string;
  /** True only when all five sections were found with content. */
  complete: boolean;
};

/**
 * Label text as the prompt defines it. The emoji is matched optionally so a
 * model that drops it still parses; the words are what actually delimit.
 */
const SECTION_PATTERNS: { key: AnalysisSectionKey; label: RegExp }[] = [
  { key: 'meal', label: /MEAL/ },
  { key: 'score', label: /SCORE/ },
  { key: 'sensitivity', label: /POSSIBLE\s+SENSITIVITY/ },
  { key: 'betterOption', label: /BETTER\s+OPTION/ },
  { key: 'nextStep', label: /NEXT\s+STEP/ },
];

/**
 * A heading line: optional emoji/punctuation, the label, optional trailing
 * colon. Anchored to a line start so the same words inside body prose — "a
 * better option would be…" — cannot be mistaken for a heading.
 */
function headingMatcher(label: RegExp): RegExp {
  return new RegExp(`^[^\\p{L}\\n]*${label.source}\\s*:?\\s*`, 'iu');
}

export function parseAnalysisSections(raw: string | null | undefined): ParsedAnalysis {
  const empty: ParsedAnalysis = {
    meal: '',
    score: '',
    sensitivity: '',
    betterOption: '',
    nextStep: '',
    preamble: '',
    trailing: '',
    complete: false,
  };
  if (!raw || !raw.trim()) return empty;

  const lines = raw.split('\n');

  // Locate each heading. Order is not assumed — a reply that reorders sections
  // still parses, and only a genuinely missing one fails the completeness check.
  const marks: { key: AnalysisSectionKey; line: number; rest: string }[] = [];
  lines.forEach((line, i) => {
    for (const { key, label } of SECTION_PATTERNS) {
      if (marks.some((m) => m.key === key)) continue;
      const m = headingMatcher(label).exec(line);
      if (m) {
        marks.push({ key, line: i, rest: line.slice(m[0].length).trim() });
        break;
      }
    }
  });

  if (marks.length < SECTION_PATTERNS.length) return { ...empty, trailing: raw.trim() };

  marks.sort((a, b) => a.line - b.line);

  const out: Record<AnalysisSectionKey, string> = {
    meal: '',
    score: '',
    sensitivity: '',
    betterOption: '',
    nextStep: '',
  };

  marks.forEach((mark, idx) => {
    const end = idx + 1 < marks.length ? marks[idx + 1].line : lines.length;
    const body = lines.slice(mark.line + 1, end).join('\n').trim();
    // Content may sit on the heading line itself or on the lines beneath it.
    out[mark.key] = [mark.rest, body].filter(Boolean).join(' ').trim();
  });

  const complete = SECTION_PATTERNS.every(({ key }) => out[key].length > 0);
  return {
    ...out,
    // Everything above the first heading. Section bodies start one line below
    // their own heading, so without this a preamble would silently vanish from
    // an otherwise complete result.
    preamble: lines.slice(0, marks[0].line).join('\n').trim(),
    trailing: '',
    complete,
  };
}
