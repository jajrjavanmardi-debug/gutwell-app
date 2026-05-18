import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export const HEALTH_DATA_CONSENT_STORAGE_KEY = 'gutwell_health_data_consent';
export const HEALTH_DATA_CONSENT_VERSION = '2026-05-18';

type ConsentRow = Record<string, unknown>;

export type HealthDataConsentStatus = {
  accepted: boolean;
  acceptedAt: string | null;
  version: string;
};

export type HealthDataConsentOptions = {
  userId?: string | null;
  storeRemotely?: boolean;
};

function isProfileConsentSchemaCompatibilityError(error: { code?: string; message?: string }): boolean {
  const message = error.message?.toLowerCase() ?? '';
  return (
    error.code === 'PGRST204'
    || error.code === '42703'
    || message.includes('health_data_consent')
  );
}

function normalizeConsentStatus(value: unknown): HealthDataConsentStatus {
  if (!value || typeof value !== 'object') {
    return { accepted: false, acceptedAt: null, version: HEALTH_DATA_CONSENT_VERSION };
  }

  const data = value as Partial<HealthDataConsentStatus>;
  return {
    accepted: Boolean(data.accepted),
    acceptedAt: typeof data.acceptedAt === 'string' ? data.acceptedAt : null,
    version: typeof data.version === 'string' ? data.version : HEALTH_DATA_CONSENT_VERSION,
  };
}

function normalizeRemoteConsent(row: ConsentRow | null | undefined): HealthDataConsentStatus {
  if (!row) return { accepted: false, acceptedAt: null, version: HEALTH_DATA_CONSENT_VERSION };
  return {
    accepted: row.health_data_consent_accepted === true,
    acceptedAt: typeof row.health_data_consent_accepted_at === 'string'
      ? row.health_data_consent_accepted_at
      : null,
    version: typeof row.health_data_consent_version === 'string'
      ? row.health_data_consent_version
      : HEALTH_DATA_CONSENT_VERSION,
  };
}

async function readLocalConsent(): Promise<HealthDataConsentStatus> {
  const raw = await AsyncStorage.getItem(HEALTH_DATA_CONSENT_STORAGE_KEY);
  if (!raw) return { accepted: false, acceptedAt: null, version: HEALTH_DATA_CONSENT_VERSION };

  try {
    return normalizeConsentStatus(JSON.parse(raw));
  } catch {
    return { accepted: false, acceptedAt: null, version: HEALTH_DATA_CONSENT_VERSION };
  }
}

async function cacheConsent(status: HealthDataConsentStatus): Promise<void> {
  await AsyncStorage.setItem(HEALTH_DATA_CONSENT_STORAGE_KEY, JSON.stringify(status));
}

async function saveRemoteConsent(userId: string, acceptedAt: string): Promise<void> {
  const { error } = await supabase
    .from('user_profiles')
    .upsert(
      {
        user_id: userId,
        health_data_consent_accepted: true,
        health_data_consent_accepted_at: acceptedAt,
        health_data_consent_version: HEALTH_DATA_CONSENT_VERSION,
        updated_at: acceptedAt,
      },
      { onConflict: 'user_id' }
    );

  if (error && !isProfileConsentSchemaCompatibilityError(error)) {
    throw error;
  }
}

export async function getHealthDataConsentStatus(
  options: HealthDataConsentOptions = {},
): Promise<HealthDataConsentStatus> {
  const localConsent = await readLocalConsent();
  const shouldReadRemote = options.storeRemotely !== false && Boolean(options.userId);

  if (!shouldReadRemote || !options.userId) {
    return localConsent;
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('health_data_consent_accepted, health_data_consent_accepted_at, health_data_consent_version')
    .eq('user_id', options.userId)
    .maybeSingle();

  if (error) {
    if (isProfileConsentSchemaCompatibilityError(error)) return localConsent;
    throw error;
  }

  const remoteConsent = normalizeRemoteConsent(data as ConsentRow | null);
  if (remoteConsent.accepted) {
    await cacheConsent(remoteConsent);
    return remoteConsent;
  }

  if (localConsent.accepted && localConsent.acceptedAt) {
    await saveRemoteConsent(options.userId, localConsent.acceptedAt);
    return localConsent;
  }

  return remoteConsent;
}

export async function acceptHealthDataConsent(
  options: HealthDataConsentOptions = {},
): Promise<HealthDataConsentStatus> {
  const acceptedAt = new Date().toISOString();
  const status: HealthDataConsentStatus = {
    accepted: true,
    acceptedAt,
    version: HEALTH_DATA_CONSENT_VERSION,
  };

  await cacheConsent(status);

  if (options.storeRemotely !== false && options.userId) {
    await saveRemoteConsent(options.userId, acceptedAt);
  }

  return status;
}
