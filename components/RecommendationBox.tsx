import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BorderRadius, Colors, FontFamily, FontSize } from '../constants/theme';

type RecommendationBoxProps = {
  text: string;
  onPress: () => void;
};

export default function RecommendationBox({ text, onPress }: RecommendationBoxProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <Ionicons name="lock-closed" size={16} color={Colors.accent} />
      <Text style={styles.text}>{text}</Text>
      <Ionicons name="chevron-forward" size={14} color={Colors.accent} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${Colors.accent}15`,
    borderRadius: BorderRadius.lg,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${Colors.accent}30`,
  },
  text: {
    flex: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.accent,
  },
});
