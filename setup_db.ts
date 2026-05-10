/**
 * TEMPORARY — run with: npx tsx setup_db.ts
 *
 * supabase-js cannot execute raw DDL (CREATE TABLE) against Postgres; use the SQL
 * printed below in Supabase Dashboard → SQL Editor (or `supabase db push`).
 *
 * The app’s `lib/supabaseClient` depends on React Native `expo-secure-store`, so it
 * does not load in Node. This script uses the same env vars with a Node-safe client
 * only to probe whether `health_logs` exists.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function migrationSql(): string {
  try {
    return readFileSync(
      join(__dirname, 'supabase', 'migrations', '007_health_logs.sql'),
      'utf8',
    ).trim();
  } catch {
    return FALLBACK_HEALTH_LOGS_SQL;
  }
}

/** Only used if migrations file is missing; keep in sync with 007_health_logs.sql. */
const FALLBACK_HEALTH_LOGS_SQL = `
CREATE TABLE IF NOT EXISTS public.health_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL DEFAULT '',
  gut_score INTEGER CHECK (gut_score IS NULL OR (gut_score >= 1 AND gut_score <= 10)),
  analysis_content TEXT NOT NULL DEFAULT '',
  nutrients JSONB NOT NULL DEFAULT '[]'::jsonb,
  language TEXT NOT NULL DEFAULT 'en'
);

CREATE INDEX IF NOT EXISTS idx_health_logs_user_created ON public.health_logs(user_id, created_at DESC);

ALTER TABLE public.health_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own health_logs"
  ON public.health_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health_logs"
  ON public.health_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health_logs"
  ON public.health_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own health_logs"
  ON public.health_logs FOR DELETE
  USING (auth.uid() = user_id);
`.trim();

async function main() {
  const sql = migrationSql();
  console.log(
    '\n--- DDL is not available via supabase-js. Paste this in Supabase → SQL Editor (or `supabase db push`) ---\n\n```sql\n' +
      sql +
      '\n```\n\n--- End SQL ---\n',
  );

  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_KEY ??
    ''
  ).trim();

  if (!url || !key) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env');
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.from('health_logs').select('*').limit(1);

  if (error) {
    console.error('health_logs probe failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    process.exitCode = 1;
    return;
  }

  console.log('health_logs exists. Sample query OK. Rows (up to 1):', data ?? []);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
