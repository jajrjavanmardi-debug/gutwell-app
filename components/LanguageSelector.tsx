import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontFamily } from '../constants/theme';
import { LANGUAGE_OPTIONS, type AppLanguage } from '../contexts/LanguageContext';

type LanguageSelectorProps = {
  language: AppLanguage;
  onChange: (language: AppLanguage) => void;
  title: string;
  subtitle?: string;
  isRtl?: boolean;
};

export function LanguageSelector({
  language,
  onChange,
  title,
  subtitle,
  isRtl = false,
}: LanguageSelectorProps) {
  return (
    <View style={styles.card}>
      <Text style={[styles.title, isRtl && styles.rtlText]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, isRtl && styles.rtlText]}>{subtitle}</Text>
      ) : null}
      <View style={[styles.optionsRow, isRtl && styles.rtlRow]}>
        {LANGUAGE_OPTIONS.map((option) => {
          const active = option.code === language;
          return (
            <Pressable
              key={option.code}
              onPress={() => onChange(option.code)}
              style={({ pressed }) => [
                styles.optionButton,
                active && styles.optionButtonActive,
                pressed && styles.optionButtonPressed,
              ]}
            >
              <Text style={[styles.optionShort, active && styles.optionShortActive]}>
                {option.shortLabel}
              </Text>
              <Text style={[styles.optionNative, active && styles.optionNativeActive]}>
                {option.nativeLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: 14,
    gap: 10,
  },
  title: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'left',
  },
  subtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.58)',
    lineHeight: 18,
    marginTop: -4,
    textAlign: 'left',
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  optionButtonActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  optionButtonPressed: {
    opacity: 0.82,
  },
  optionShort: {
    fontFamily: FontFamily.sansBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  optionShortActive: {
    color: '#0B1F14',
  },
  optionNative: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.62)',
    marginTop: 2,
  },
  optionNativeActive: {
    color: 'rgba(11,31,20,0.68)',
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
