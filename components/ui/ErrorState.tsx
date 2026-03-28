import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  type?: 'error' | 'offline' | 'empty';
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title,
  message,
  onRetry,
  icon,
  type = 'error',
}) => {
  const defaults = {
    error: { icon: 'alert-circle-outline', title: 'Something went wrong', message: 'Please try again.' },
    offline: { icon: 'cloud-offline-outline', title: 'No connection', message: 'Check your internet and try again.' },
    empty: { icon: 'leaf-outline', title: 'Nothing here yet', message: 'Data will appear once you start logging.' },
  };
  const d = defaults[type];
  const displayIcon = (icon || d.icon) as keyof typeof Ionicons.glyphMap;
  const displayTitle = title || d.title;
  const displayMessage = message || d.message;

  const iconColor =
    type === 'error' ? '#E07070' :
    type === 'offline' ? Colors.textTertiary :
    Colors.secondary;

  const iconBg =
    type === 'error' ? '#E0707015' :
    type === 'offline' ? Colors.textTertiary + '15' :
    Colors.secondary + '15';

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={displayIcon} size={40} color={iconColor} />
      </View>
      <Text style={styles.title}>{displayTitle}</Text>
      <Text style={styles.message}>{displayMessage}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.7}>
          <Ionicons name="refresh" size={15} color={Colors.secondary} />
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontFamily: FontFamily.displayMedium,
    fontSize: FontSize.lg,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  message: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.secondary + '40',
  },
  retryText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.secondary,
  },
});
