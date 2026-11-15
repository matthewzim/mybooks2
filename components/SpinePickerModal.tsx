/**
 * SpinePickerModal Component
 *
 * A sheet holding the SpinePicker, for choosing a book's spine outside the
 * book detail view — offered right after a book is added from search.
 */

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SpinePicker } from '@/components/SpinePicker';
import { Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { Book } from '@/types';

interface SpinePickerModalProps {
  visible: boolean;
  book: Book | null;
  onBookUpdated: (book: Book) => void;
  onClose: () => void;
}

export function SpinePickerModal({ visible, book, onBookUpdated, onClose }: SpinePickerModalProps) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.inputBorder }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {book?.title || 'Choose a Spine'}
          </Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.done, { color: colors.primary }]}>Done</Text>
          </Pressable>
        </View>
        <View style={styles.body}>
          <SpinePicker book={book} onBookUpdated={onBookUpdated} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    flex: 1,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  done: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  body: {
    padding: Spacing.md,
  },
});

export default SpinePickerModal;
