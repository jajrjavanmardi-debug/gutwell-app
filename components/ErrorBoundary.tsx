import React, { Component, type ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sentry from '@sentry/react-native';
import { Colors, FontFamily, FontSize, Spacing } from '../constants/theme';
import { LanguageContext } from '../lib/LanguageContext';
import { getTranslation } from '../lib/i18n';

type Props = {
  children: ReactNode;
  fallbackTitle?: string;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<Props, State> {
  // A class component cannot call useTranslation, so it reads the language from
  // context directly. At the app root this boundary sits OUTSIDE LanguageProvider
  // (so it still catches a crash inside the provider itself), where the context
  // default resolves to English — the correct fallback for a crash screen.
  static contextType = LanguageContext;

  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn('ErrorBoundary caught:', error);
    // Still report to Sentry — this boundary handles the error, so Sentry's own
    // wrapper boundary would otherwise never see it.
    Sentry.captureException(error);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    // `this.context` is typed as unknown without a `declare` field, which Babel
    // rejects; the cast keeps the runtime behaviour identical.
    const ctx = this.context as React.ContextType<typeof LanguageContext> | undefined;
    const t = getTranslation(ctx?.language ?? 'en');
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.iconCircle}>
            <Ionicons name="leaf-outline" size={32} color={Colors.secondary} />
          </View>
          <Text style={styles.title}>{t.errorBoundary.title}</Text>
          <Text style={styles.subtitle}>
            {this.props.fallbackTitle || t.errorBoundary.message}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={this.handleRetry}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t.errorBoundary.retry}
          >
            <Ionicons name="refresh" size={18} color="#FFFFFF" />
            <Text style={styles.retryText}>{t.errorBoundary.retry}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
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
