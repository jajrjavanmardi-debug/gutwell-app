import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors, FontSize, FontFamily, Shadows, Spacing } from '../../constants/theme';
import { FabActionMenu } from '../../components/FabActionMenu';

/** Expo Router error boundary for all tab screens */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={ebStyles.container}>
      <View style={ebStyles.iconCircle}>
        <Ionicons name="leaf-outline" size={32} color={Colors.secondary} />
      </View>
      <Text style={ebStyles.title}>Something went wrong</Text>
      <Text style={ebStyles.subtitle}>
        An unexpected error occurred. Please try again.
      </Text>
      <TouchableOpacity style={ebStyles.retryButton} onPress={retry} activeOpacity={0.7}>
        <Ionicons name="refresh" size={18} color="#FFFFFF" />
        <Text style={ebStyles.retryText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

const ebStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
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
});

export default function TabLayout() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  // Session guard: tabs are meaningless without an account (every data call
  // is RLS-scoped to auth.uid()). The index gate owns the routing decision.
  if (loading) return null;
  if (!session) return <Redirect href="/" />;

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

  // The "+" FAB action menu — Cal AI logs food/exercise here; Gutwell logs
  // a meal scan, a daily check-in, a symptom, or opens the food log.
  const fabActions = [
    {
      key: 'scan',
      label: 'Scan meal',
      icon: <Ionicons name="scan-outline" size={26} color={Colors.secondary} />,
      onPress: () => router.push('/photo-analysis'),
    },
    {
      key: 'checkin',
      label: 'Daily check-in',
      icon: <Ionicons name="body-outline" size={26} color={Colors.secondary} />,
      onPress: () => router.push('/(tabs)/checkin'),
    },
    {
      key: 'symptom',
      label: 'Log symptom',
      icon: <Ionicons name="pulse-outline" size={26} color={Colors.secondary} />,
      onPress: () => router.push('/log-symptom'),
    },
    {
      key: 'food',
      label: 'Log food',
      icon: <Ionicons name="restaurant-outline" size={26} color={Colors.secondary} />,
      onPress: () => router.push('/(tabs)/food'),
    },
  ];

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors.secondary,
          tabBarInactiveTintColor: '#777777',
          headerShown: false,
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
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              renderTabIcon(focused, 'home', 'home-outline', color)
            ),
          }}
        />
        <Tabs.Screen
          name="progress"
          options={{
            title: 'Progress',
            tabBarIcon: ({ color, focused }) => (
              renderTabIcon(focused, 'trending-up', 'trending-up-outline', color)
            ),
          }}
        />
        <Tabs.Screen
          name="challenges"
          options={{
            title: 'Challenges',
            tabBarIcon: ({ color, focused }) => (
              renderTabIcon(focused, 'flame', 'flame-outline', color)
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, focused }) => (
              renderTabIcon(focused, 'person', 'person-outline', color)
            ),
          }}
        />
        {/* Reachable via the "+" menu and Home cards, hidden from the tab bar. */}
        <Tabs.Screen name="checkin" options={{ href: null }} />
        <Tabs.Screen name="food" options={{ href: null }} />
      </Tabs>

      {/* Center floating "+" FAB (toggles to X while the menu is open). */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={menuOpen ? 'Close add menu' : 'Open add menu'}
        onPress={() => {
          if (Platform.OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          setMenuOpen((v) => !v);
        }}
      >
        <Ionicons name={menuOpen ? 'close' : 'add'} size={30} color={Colors.text} />
      </TouchableOpacity>

      <FabActionMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={fabActions}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapFocused: {
    backgroundColor: Colors.secondary + '24',
  },
  fab: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: Platform.OS === 'ios' ? 34 : 22,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.background,
    ...Shadows.md,
  },
});
