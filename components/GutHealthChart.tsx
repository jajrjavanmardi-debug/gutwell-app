import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { BorderRadius, FontFamily, FontSize, Spacing } from '../constants/theme';
import type { AppLanguage } from '../lib/app-language';
import { supabase } from '../lib/supabase';

type HealthLogTrendRow = {
  id: number | string;
  created_at: string;
  gut_score: number | null;
};

type TrendPoint = {
  id: string;
  label: string;
  score: number;
};

const CHART_COPY: Record<AppLanguage, {
  kicker: string;
  title: string;
  pill: string;
  score: string;
  date: string;
  empty: string;
  caption: string;
}> = {
  en: {
    kicker: 'Date / Score',
    title: 'Gut Health Trend',
    pill: 'Last 7 logs',
    score: 'Score',
    date: 'Date',
    empty: 'Log more meals to see your trend chart!',
    caption: 'Success green line tracks meal impact score from your latest analyses.',
  },
  de: {
    kicker: 'Datum / Score',
    title: 'Darmgesundheits-Trend',
    pill: 'Letzte 7 Logs',
    score: 'Score',
    date: 'Datum',
    empty: 'Logge mehr Mahlzeiten, um deinen Trend zu sehen!',
    caption: 'Die grüne Linie zeigt den Mahlzeiten-Impact-Score deiner neuesten Analysen.',
  },
  fa: {
    kicker: 'تاریخ / امتیاز',
    title: 'روند سلامت روده',
    pill: '۷ ثبت آخر',
    score: 'امتیاز',
    date: 'تاریخ',
    empty: 'برای دیدن نمودار روند، غذاهای بیشتری ثبت کنید!',
    caption: 'خط سبز، امتیاز تأثیر غذا را از آخرین تحلیل های شما نشان می دهد.',
  },
};

const LANGUAGE_LOCALES: Record<AppLanguage, string> = {
  en: 'en-US',
  de: 'de-DE',
  fa: 'fa-IR',
};

async function resolveUserId(userId?: string): Promise<string | undefined> {
  if (userId) return userId;
  const sessionUserId = (await supabase.auth.getSession()).data.session?.user.id;
  if (sessionUserId) return sessionUserId;
  return (await supabase.auth.getUser()).data.user?.id;
}

function normalizeScore(value: number | null): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10, Math.round(value ?? 0)));
}

function formatDateLabel(value: string, language: AppLanguage): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(LANGUAGE_LOCALES[language], { month: 'short', day: 'numeric' });
}

function formatTimeLabel(value: string, language: AppLanguage): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(LANGUAGE_LOCALES[language], { hour: '2-digit', minute: '2-digit' });
}

function buildSmoothPath(points: TrendPoint[], width: number, height: number): string {
  if (points.length === 0) return '';

  const xStep = width / Math.max(points.length - 1, 1);
  const coords = points.map((point, index) => ({
    x: index * xStep,
    y: height - (point.score / 10) * height,
  }));

  return coords.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    const previous = coords[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX.toFixed(1)} ${previous.y.toFixed(1)}, ${controlX.toFixed(1)} ${point.y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, '');
}

export function GutHealthChart({ userId, language = 'en' }: { userId?: string; language?: AppLanguage }) {
  const [rows, setRows] = useState<HealthLogTrendRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const copy = CHART_COPY[language];
  const isRtl = language === 'fa';

  useEffect(() => {
    let isActive = true;

    async function loadTrend() {
      setIsLoading(true);
      try {
        const resolvedUserId = await resolveUserId(userId);
        if (!resolvedUserId) {
          if (isActive) setRows([]);
          return;
        }

        const { data, error } = await supabase
          .from('health_logs')
          .select('id, created_at, gut_score')
          .eq('user_id', resolvedUserId)
          .not('gut_score', 'is', null)
          .order('created_at', { ascending: false })
          .limit(7);

        if (error) throw error;
        if (isActive) setRows(data ?? []);
      } catch (error) {
        console.warn('Gut health trend fetch failed:', error);
        if (isActive) setRows([]);
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    void loadTrend();

    return () => {
      isActive = false;
    };
  }, [userId]);

  const points = useMemo<TrendPoint[]>(() => {
    const chronologicalRows = [...rows].reverse();
    const uniqueDayCount = new Set(
      chronologicalRows.map((row) => new Date(row.created_at).toDateString())
    ).size;
    const useTimeLabels = chronologicalRows.length > 1 && uniqueDayCount === 1;

    return chronologicalRows.map((row) => ({
      id: String(row.id),
      label: useTimeLabels ? formatTimeLabel(row.created_at, language) : formatDateLabel(row.created_at, language),
      score: normalizeScore(row.gut_score),
    }));
  }, [language, rows]);
  const chartWidth = 320;
  const chartHeight = 140;
  const path = buildSmoothPath(points, chartWidth, chartHeight);

  return (
    <View style={styles.card}>
      <View style={[styles.header, isRtl && styles.rtlRow]}>
        <View>
          <Text style={[styles.kicker, isRtl && styles.rtlText]}>{copy.kicker}</Text>
          <Text style={[styles.title, isRtl && styles.rtlText]}>{copy.title}</Text>
        </View>
        <View style={styles.pill}>
          <Text style={[styles.pillText, isRtl && styles.rtlText]}>{copy.pill}</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.placeholder}>
          <ActivityIndicator color="#4CAF50" />
        </View>
      ) : points.length < 2 ? (
        <View style={styles.placeholder}>
          <Text style={[styles.placeholderText, isRtl && styles.rtlText]}>{copy.empty}</Text>
        </View>
      ) : (
        <>
          <Svg width="100%" height={205} viewBox={`0 0 ${chartWidth} 205`}>
            {[0, 5, 10].map((score) => {
              const y = chartHeight - (score / 10) * chartHeight;
              return (
                <Line
                  key={score}
                  x1="0"
                  x2={chartWidth}
                  y1={y}
                  y2={y}
                  stroke="#DDEFE4"
                  strokeWidth="1"
                />
              );
            })}
            <SvgText x="0" y="14" fill="#52645A" fontSize="10" fontWeight="700">
              {copy.score}
            </SvgText>
            <Path d={path} fill="none" stroke="#4CAF50" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
            {points.map((point, index) => {
              const x = index * (chartWidth / Math.max(points.length - 1, 1));
              const y = chartHeight - (point.score / 10) * chartHeight;
              return (
                <Circle
                  key={point.id}
                  cx={x}
                  cy={y}
                  r="6"
                  fill="#4CAF50"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />
              );
            })}
            {points.map((point, index) => {
              const x = index * (chartWidth / Math.max(points.length - 1, 1));
              return (
                <SvgText key={`${point.id}-date`} x={x} y="172" fill="#52645A" fontSize="10" textAnchor="middle">
                  {point.label}
                </SvgText>
              );
            })}
            <SvgText x={chartWidth / 2} y="200" fill="#52645A" fontSize="11" fontWeight="700" textAnchor="middle">
              {copy.date}
            </SvgText>
          </Svg>
          <Text style={[styles.caption, isRtl && styles.rtlText]}>{copy.caption}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#ECE7D9',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    marginBottom: Spacing.md,
    padding: Spacing.lg,
    shadowColor: '#102018',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 5,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  kicker: {
    color: '#4CAF50',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  title: {
    color: '#15212D',
    fontFamily: FontFamily.sansExtraBold,
    fontSize: FontSize.xl,
    marginTop: 2,
  },
  pill: {
    backgroundColor: '#E8F5EC',
    borderColor: '#BFE5CB',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
  },
  pillText: {
    color: '#276E3A',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  placeholder: {
    alignItems: 'center',
    minHeight: 160,
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#52645A',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  caption: {
    color: '#52645A',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
