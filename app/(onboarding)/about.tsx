import React, { useState } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontFamily } from '../../constants/theme';
import StarFieldBackground from '../../components/StarFieldBackground';

const { width } = Dimensions.get('window');

export default function AboutScreen() {
  const [name, setName] = useState('');
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  const canContinue = name.trim().length >= 1;

  const handleContinue = async () => {
    if (!canContinue || loading) return;
    setLoading(true);
    try {
      await AsyncStorage.setItem('onboarding_name', name.trim());
      router.push('/(onboarding)/questions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <StatusBar style="light" />
        <LinearGradient colors={['#0B1F14', '#1B4332']} style={StyleSheet.absoluteFill} />
        <StarFieldBackground count={100} seed={55} />

        <SafeAreaView edges={['top']} style={styles.safeTop}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </SafeAreaView>

        {/* Main content */}
        <View style={styles.content}>
          <Text style={styles.label}>ABOUT YOU</Text>
          <Text style={styles.title}>{"What should we\ncall you?"}</Text>
          <Text style={styles.subtitle}>
            {"We'll personalise your gut health journey\naround you."}
          </Text>

          {/* Name input */}
          <View
            style={[
              styles.inputContainer,
              focused && styles.inputContainerFocused,
            ]}
          >
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your first name"
              placeholderTextColor="rgba(255,255,255,0.35)"
              autoCapitalize="words"
              autoFocus={false}
              returnKeyType="done"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={handleContinue}
            />
          </View>
        </View>

        {/* Bottom CTA */}
        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={!canContinue || loading}
            activeOpacity={0.88}
          >
            <Text style={styles.continueText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  safeTop: {
    paddingHorizontal: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  label: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.5,
  },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: 34,
    color: '#FFFFFF',
    lineHeight: 42,
    marginTop: 8,
  },
  subtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 12,
    lineHeight: 22,
  },
  inputContainer: {
    height: 60,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20,
    justifyContent: 'center',
    marginTop: 40,
  },
  inputContainerFocused: {
    borderColor: 'rgba(82,183,136,0.8)',
  },
  input: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 17,
    color: '#FFFFFF',
    height: '100%',
  },
  bottomSection: {
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  continueButton: {
    width: '100%',
    height: 60,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.4,
  },
  continueText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 17,
    color: '#0B1F14',
    letterSpacing: -0.3,
  },
});
