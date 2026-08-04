import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { Toast } from '../components/ui/Toast';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import {
  Colors,
  Spacing,
  FontSize,
  FontFamily,
} from '../constants/theme';
import { useTranslation } from '../lib/i18n';

export default function ChangePasswordScreen() {
  const t = useTranslation();
  const { updatePassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'info' as 'success' | 'error' | 'info',
  });

  const handleSave = async () => {
    if (newPassword.length < 6) {
      setToast({ visible: true, message: t.changePassword.tooShort, type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setToast({ visible: true, message: t.changePassword.mismatch, type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await updatePassword(newPassword);
      if (error) {
        setToast({ visible: true, message: t.changePassword.updateFailed, type: 'error' });
      } else {
        setToast({ visible: true, message: t.changePassword.success, type: 'success' });
        setTimeout(() => router.back(), 600);
      }
    } catch {
      setToast({ visible: true, message: t.changePassword.genericError, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t.common.goBack}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.changePassword.headerTitle}</Text>
        <View style={styles.backButton} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          {/* New Password */}
          <View style={styles.field}>
            <Input
              label={t.changePassword.newPasswordLabel}
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={t.changePassword.newPasswordPlaceholder}
              secureTextEntry={!showNew}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowNew(!showNew)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={showNew ? t.changePassword.hideNewPassword : t.changePassword.showNewPassword}
            >
              <Ionicons
                name={showNew ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={Colors.textTertiary}
              />
            </TouchableOpacity>
          </View>

          {/* Confirm Password */}
          <View style={styles.field}>
            <Input
              label={t.changePassword.confirmPasswordLabel}
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t.changePassword.confirmPasswordPlaceholder}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowConfirm(!showConfirm)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={showConfirm ? t.changePassword.hideConfirmPassword : t.changePassword.showConfirmPassword}
            >
              <Ionicons
                name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={Colors.textTertiary}
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>{t.changePassword.hint}</Text>

          {/* Save Button */}
          <Button
            title={t.changePassword.saveButton}
            onPress={handleSave}
            loading={saving}
            shape="pill"
            fullWidth
            size="lg"
            style={styles.saveButton}
          />
        </View>
      </KeyboardAvoidingView>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onDismiss={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    color: Colors.text,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    gap: Spacing.md,
  },
  field: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: Spacing.md,
    // align with the input's vertical centre, accounting for the label above it
    top: 28,
    bottom: 0,
    justifyContent: 'center',
  },
  hint: {
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginLeft: Spacing.xs,
  },
  saveButton: {
    marginTop: Spacing.sm,
  },
});
