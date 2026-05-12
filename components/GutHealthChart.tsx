import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { BorderRadius, FontFamily, FontSize, Spacing } from '../constants/theme';
import type { AppLanguage } from '../lib/app-language';
import { isGuestModeActive } from '../lib/guest-mode';
import { getPhotoAnalysisHistory, type PhotoAnalysisHistoryItem } from '../lib/photo-analysis-history';
import { supabase } from '../lib/supabase';

type HealthLogTrendRow = {
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
    kicker: 'Daily average',
    title: 'Gut Health Trend',
    pill: 'Last 14 days',
    score: 'Avg score',
    date: 'Date',
    empty: 'No meal scores logged in the last 14 days.',
    caption: 'Shows daily average Gut Scores from food analyses over the last 14 days.',
  },
  de: {
    kicker: 'Tagesdurchschnitt',
    title: 'Darmgesundheits-Trend',
    pill: 'Letzte 14 Tage',
    score: 'Ø Score',
    date: 'Datum',
    empty: 'Keine Mahlzeiten-Scores in den letzten 14 Tagen.',
    caption: 'Zeigt den täglichen Durchschnitt deiner Darm-Scores aus Food-Analysen der letzten 14 Tage.',
  },
  fa: {
    kicker: 'میانگین روزانه',
    title: 'روند سلامت روده',
    pill: '۱۴ روز گذشته',
    score: 'میانگین امتیاز',
    date: 'تاریخ',
    empty: 'در ۱۴ روز گذشته امتیاز غذایی ثبت نشده است.',
    caption: 'میانگین روزانه امتیازهای روده از تحلیل غذاها در ۱۴ روز گذشته را نشان می دهد.',
  },
};

const TREND_WINDOW_DAYS = 14;

const LANGUAGE_LOCALES: Record<AppLanguage, string> = {
  en: 'en-US',
  de: 'de-DE',
  fa: 'fa-IR',
};

async function resolveUserId(userId?: string): Promise<string | undefined> {
  if (userId) return userId;
  if (await isGuestModeActive()) return undefined;
  const sessionUserId = (await supabase.auth.getSession()).data.session?.user.id;
  if (sessionUserId) return sessionUserId;
  return (await supabase.auth.getUser()).data.user?.id;
}

function normalizeScore(value: number | null): number | null {
  if (!Number.isFinite(value)) return null;
  const score = value ?? 0;
  if (score < 1 || score > 10) return null;
  return score;
}

function parseHistoryScore(item: PhotoAnalysisHistoryItem): number | null {
  const rawScore = item.mealImpactScore?.match(/\d{1,2}/)?.[0];
  const score = rawScore ? Number(rawScore) : null;
  return normalizeScore(score);
}

function mapLocalHistoryToTrendRows(history: PhotoAnalysisHistoryItem[]): HealthLogTrendRow[] {
  return history
    .map((item) => ({
      created_at: item.createdAt,
      gut_score: parseHistoryScore(item),
    }))
    .filter((row): row is HealthLogTrendRow => row.gut_score !== null);
}

function clampAveragedScore(value: number): number {
  return Math.max(1, Math.min(10, Number(value.toFixed(1))));
}

function formatCalendarKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTrendWindowStart(): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (TREND_WINDOW_DAYS - 1));
  return start;
}

function formatDateLabel(value: Date, language: AppLanguage): string {
  const date = value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(LANGUAGE_LOCALES[language], { month: 'short', day: 'numeric' });
}

function getPointX(index: number, totalPoints: number, width: number): number {
  if (totalPoints <= 1) return width / 2;
  return index * (width / (totalPoints - 1));
}

function buildSmoothPath(points: TrendPoint[], width: number, height: number): string {
  if (points.length === 0) return '';

  const coords = points.map((point, index) => ({
    x: getPointX(index, points.length, width),
    y: height - (point.score / 10) * height,
  }));

  return coords.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    const previous = coords[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX.toFixed(1)} ${previous.y.toFixed(1)}, ${controlX.toFixed(1)} ${point.y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, '');
}

function buildDailyAveragePoints(rows: HealthLogTrendRow[], language: AppLanguage): TrendPoint[] {
  const dailyBuckets = new Map<string, { date: Date; total: number; count: number }>();

  rows.forEach((row) => {
    const score = normalizeScore(row.gut_score);
    const date = new Date(row.created_at);
    if (score === null || Number.isNaN(date.getTime())) return;

    const key = formatCalendarKey(date);
    const existing = dailyBuckets.get(key);
    if (existing) {
      existing.total += score;
      existing.count += 1;
      return;
    }

    dailyBuckets.set(key, {
      date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
      total: score,
      count: 1,
    });
  });

  return Array.from(dailyBuckets.entries())
    .sort(([, a], [, b]) => a.date.getTime() - b.date.getTime())
    .map(([dateKey, bucket]) => ({
      id: dateKey,
      label: formatDateLabel(bucket.date, language),
      score: clampAveragedScore(bucket.total / bucket.count),
    }));
}

function shouldShowDateLabel(index: number, totalPoints: number): boolean {
  if (totalPoints <= 7) return true;
  return index === 0 || index === totalPoints - 1 || index % 2 === 0;
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
          const localHistory = await getPhotoAnalysisHistory();
          if (isActive) setRows(mapLocalHistoryToTrendRows(localHistory));
          return;
        }

        const { data, error } = await supabase
          .from('health_logs')
          .select('created_at, gut_score')
          .eq('user_id', resolvedUserId)
          .not('gut_score', 'is', null)
          .gte('created_at', getTrendWindowStart().toISOString())
          .order('created_at', { ascending: true })
          .limit(200);

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

  const points = useMemo<TrendPoint[]>(
    () => buildDailyAveragePoints(rows, language),
    [language, rows]
  );
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
      ) : points.length === 0 ? (
        <View style={styles.placeholder}>
          <Text style={[styles.placeholderText, isRtl && styles.rtlText]}>{copy.empty}</Text>
        </View>
      ) : (
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
          <SvgText
            x={isRtl ? chartWidth : 0}
            y="14"
            fill="#52645A"
            fontSize="10"
            fontWeight="700"
            textAnchor={isRtl ? 'end' : 'start'}
          >
            {copy.score}
          </SvgText>
          <Path d={path} fill="none" stroke="#4CAF50" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
          {points.map((point, index) => {
            const x = getPointX(index, points.length, chartWidth);
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
            if (!shouldShowDateLabel(index, points.length)) return null;
            const x = getPointX(index, points.length, chartWidth);
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
      )}

      {!isLoading ? (
        <Text style={[styles.caption, isRtl && styles.rtlText]}>{copy.caption}</Text>
      ) : null}
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
