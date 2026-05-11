import { Ionicons } from '@expo/vector-icons';
import { Tabs, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors, FontSize, FontFamily, Shadows, Spacing } from '../../../constants/theme';
import { APP_LANGUAGE_STORAGE_KEY, isRtlLanguage, parseStoredLanguage, type AppLanguage } from '../../../lib/app-language';

const TAB_COPY: Record<AppLanguage, {
  home: string;
  errorTitle: string;
  errorSubtitle: string;
  tryAgain: string;
}> = {
  en: {
    home: 'Home',
    errorTitle: 'Something went wrong',
    errorSubtitle: 'An unexpected error occurred. Please try again.',
    tryAgain: 'Try Again',
  },
  de: {
    home: 'Start',
    errorTitle: 'Etwas ist schiefgelaufen',
    errorSubtitle: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.',
    tryAgain: 'Erneut versuchen',
  },
  fa: {
    home: 'خانه',
    errorTitle: 'مشکلی پیش آمد',
    errorSubtitle: 'یک خطای غیرمنتظره رخ داد. لطفاً دوباره تلاش کنید.',
    tryAgain: 'تلاش دوباره',
  },
};

/** Expo Router error boundary for all tab screens */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const [language, setLanguage] = useState<AppLanguage>('en');
  const copy = TAB_COPY[language];
  const isRtl = isRtlLanguage(language);

  useEffect(() => {
    AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => setLanguage(parseStoredLanguage(storedLanguage)))
      .catch(console.warn);
  }, []);

  return (
    <View style={ebStyles.container}>
      <View style={ebStyles.iconCircle}>
        <Ionicons name="leaf-outline" size={32} color={Colors.secondary} />
      </View>
      <Text style={[ebStyles.title, isRtl && ebStyles.rtlText]}>{copy.errorTitle}</Text>
      <Text style={[ebStyles.subtitle, isRtl && ebStyles.rtlText]}>
        {copy.errorSubtitle}
      </Text>
      <TouchableOpacity style={[ebStyles.retryButton, isRtl && ebStyles.rtlRow]} onPress={retry} activeOpacity={0.7}>
        <Ionicons name="refresh" size={18} color="#FFFFFF" />
        <Text style={[ebStyles.retryText, isRtl && ebStyles.rtlText]}>{copy.tryAgain}</Text>
      </TouchableOpacity>
    </View>
  );
}

const ebStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: Spacing.xl,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.xl,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.xl,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    borderRadius: 16,
  },
  retryText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: '#FFFFFF',
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});

export default function TabLayout() {
  const [language, setLanguage] = useState<AppLanguage>('en');
  const copy = TAB_COPY[language];

  useFocusEffect(
    useCallback(() => {
    AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => setLanguage(parseStoredLanguage(storedLanguage)))
      .catch(console.warn);
    }, [])
  );

  const renderTabIcon = (
    focused: boolean,
    activeIcon: keyof typeof Ionicons.glyphMap,
    inactiveIcon: keyof typeof Ionicons.glyphMap,
    color: string
  ) => (
    <View style={[styles.iconWrap, focused && styles.iconWrapFocused]}>
      <Ionicons name={focused ? activeIcon : inactiveIcon} size={20} color={color} />
    </View>
  );

  return (
    <View style={styles.rootBackground}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#2DCE89',
          tabBarInactiveTintColor: '#777777',
          headerShown: false,
          sceneStyle: { backgroundColor: 'transparent' },
          tabBarBackground: () => <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />,
          tabBarStyle: {
            backgroundColor: 'rgba(0,0,0,0.94)',
            borderTopColor: '#181818',
            borderTopWidth: 1,
            paddingTop: 8,
            paddingBottom: Platform.OS === 'ios' ? 0 : 8,
            height: Platform.OS === 'ios' ? 90 : 66,
            ...Shadows.sm,
          },
          tabBarLabelStyle: {
            fontFamily: FontFamily.sansMedium,
            fontSize: 11,
            marginTop: 1,
          },
        }}
        screenListeners={{
          tabPress: () => {
            if (Platform.OS === 'ios') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: copy.home,
            tabBarIcon: ({ color, focused }) => (
              renderTabIcon(focused, 'home', 'home-outline', color)
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  rootBackground: {
    flex: 1,
    backgroundColor: '#F4F5F0',
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapFocused: {
    backgroundColor: 'rgba(45,206,137,0.14)',
  },
});
