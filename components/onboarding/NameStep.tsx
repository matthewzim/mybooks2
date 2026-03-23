/**
 * NameStep - Name your bookshelf
 *
 * Quick naming with suggested names as tappable chips.
 */

import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, getFontFamily } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useOnboarding } from './OnboardingContext';
import { LivePreview } from './LivePreview';

const SUGGESTED_NAMES = [
  'My Library',
  'Favorites',
  'To Read',
  'Currently Reading',
  'Best of 2024',
  'Fiction Shelf',
  'Non-Fiction',
  'Classics',
];

function NameChip({
  name,
  isSelected,
  onPress,
}: {
  name: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      style={[
        styles.chip,
        {
          backgroundColor: isSelected ? colors.accent : colors.backgroundDark,
          borderColor: isSelected ? colors.accent : colors.border,
        },
      ]}
      onPress={onPress}
    >
      <Text style={[
        styles.chipText,
        { color: isSelected ? '#fff' : colors.text },
      ]}>
        {name}
      </Text>
    </Pressable>
  );
}

export function NameStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { colors } = useTheme();
  const { shelfName, setShelfName } = useOnboarding();
  const [customName, setCustomName] = useState('');
  const inputRef = useRef<TextInput>(null);

  const handleChipPress = (name: string) => {
    setShelfName(name);
    setCustomName('');
  };

  const handleCustomChange = (text: string) => {
    setCustomName(text);
    setShelfName(text);
  };

  const handleFinish = () => {
    if (!shelfName.trim()) {
      setShelfName('My Bookshelf');
    }
    onNext();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={[styles.stepLabel, { color: colors.accent }]}>STEP 4 OF 4</Text>
        <Text style={[styles.title, { color: colors.text }]}>Name your bookshelf</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Pick a name or type your own
        </Text>
      </View>

      <LivePreview />

      {/* Suggested names */}
      <View style={styles.chipsContainer}>
        {SUGGESTED_NAMES.map(name => (
          <NameChip
            key={name}
            name={name}
            isSelected={shelfName === name && !customName}
            onPress={() => handleChipPress(name)}
          />
        ))}
      </View>

      {/* Custom name input */}
      <Pressable
        style={[styles.inputRow, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
        onPress={() => inputRef.current?.focus()}
      >
        <Ionicons name="pencil" size={18} color={colors.textLight} />
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: colors.text }]}
          placeholder="Or type a custom name..."
          placeholderTextColor={colors.textLight}
          value={customName}
          onChangeText={handleCustomChange}
          maxLength={40}
          returnKeyType="done"
          showSoftInputOnFocus
        />
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          style={[styles.finishButton, { backgroundColor: colors.accent }]}
          onPress={handleFinish}
        >
          <Text style={styles.finishButtonText}>Finish</Text>
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
        </Pressable>
        <Pressable style={styles.skipBtn} onPress={onSkip}>
          <Text style={[styles.skipText, { color: colors.textLight }]}>Skip</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.xl,
    gap: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  header: {
    gap: Spacing.xs,
  },
  stepLabel: {
    fontSize: Typography.sizes.xs,
    fontFamily: getFontFamily('semibold'),
    letterSpacing: 1.5,
  },
  title: {
    fontSize: Typography.sizes.xxl,
    fontFamily: getFontFamily('bold'),
  },
  subtitle: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('regular'),
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  chip: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('medium'),
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.md,
    fontSize: Typography.sizes.lg,
    fontFamily: getFontFamily('regular'),
  },
  actions: {
    gap: Spacing.sm,
    alignItems: 'center',
  },
  finishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    width: '100%',
    minHeight: 48,
  },
  finishButtonText: {
    color: '#fff',
    fontSize: Typography.sizes.lg,
    fontFamily: getFontFamily('semibold'),
  },
  skipBtn: {
    padding: Spacing.sm,
  },
  skipText: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('medium'),
  },
});
