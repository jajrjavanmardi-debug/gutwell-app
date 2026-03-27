import React from 'react';
import { Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize } from '../constants/theme';

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color={Colors.text} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: March 2026</Text>

        <Text style={styles.heading}>1. Data We Collect</Text>
        <Text style={styles.body}>
          GutWell collects the data you voluntarily enter: check-in logs (stool type, bloating, pain, energy), food logs (meal names, meal types), symptom logs (type, severity), and basic account information (email, display name).
        </Text>

        <Text style={styles.heading}>2. How We Use Your Data</Text>
        <Text style={styles.body}>
          Your data is used solely to provide the GutWell service — displaying your health trends, calculating your gut health score, and sending reminders you configure. We do not sell or share your personal health data with third parties.
        </Text>

        <Text style={styles.heading}>3. Data Storage & Security</Text>
        <Text style={styles.body}>
          Your data is stored securely using Supabase (hosted on AWS) with encryption at rest and in transit. Row-level security ensures only you can access your data. Authentication tokens are stored in your device's secure storage.
        </Text>

        <Text style={styles.heading}>4. Data Retention</Text>
        <Text style={styles.body}>
          Your data is retained as long as your account is active. You can export your data at any time from the Profile screen. To delete your account and all associated data, contact support.
        </Text>

        <Text style={styles.heading}>5. Your Rights</Text>
        <Text style={styles.body}>
          You have the right to access, export, correct, or delete your personal data. You can exercise these rights through the app settings or by contacting us.
        </Text>

        <Text style={styles.heading}>6. Contact</Text>
        <Text style={styles.body}>
          For privacy-related questions, contact us at support@gutwell.app.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  back: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.xs },
  backText: { fontSize: FontSize.md, color: Colors.text },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.text, marginBottom: Spacing.xs },
  updated: { fontSize: FontSize.sm, color: Colors.textTertiary, marginBottom: Spacing.xl },
  heading: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.text, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  body: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 24 },
});
