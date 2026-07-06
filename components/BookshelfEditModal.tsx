/**
 * Bookshelf Edit Modal
 *
 * Modal for editing bookshelf properties including name, description,
 * shelf color, and privacy.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input } from '@/components/ui';
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
} from '@/constants/theme';
import { BOOKSHELF_COLORS } from '@/types';
import { isLightColor, BLACK_SHELF_COLOR } from '@/utils/shelfColors';
import type { Bookshelf, UpdateBookshelfInput } from '@/types';

interface BookshelfEditModalProps {
  visible: boolean;
  bookshelf: Bookshelf | null;
  onClose: () => void;
  onSave: (updates: UpdateBookshelfInput) => Promise<boolean>;
  onDelete?: () => void;
}

export function BookshelfEditModal({
  visible,
  bookshelf,
  onClose,
  onSave,
  onDelete,
}: BookshelfEditModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverColor, setCoverColor] = useState<string>(BOOKSHELF_COLORS[0]);
  const [isPublic, setIsPublic] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form values when bookshelf changes
  useEffect(() => {
    if (bookshelf) {
      setName(bookshelf.name);
      setDescription(bookshelf.description || '');
      // Shelves saved before the black option became dark grey store #000000
      const savedColor = bookshelf.cover_color === '#000000' ? BLACK_SHELF_COLOR : bookshelf.cover_color;
      setCoverColor(savedColor || BOOKSHELF_COLORS[0]);
      setIsPublic(bookshelf.is_public);
      setError(null);
    }
  }, [bookshelf]);

  /**
   * Validate form
   */
  const validateForm = (): boolean => {
    if (!name.trim()) {
      setError('Bookshelf name is required');
      return false;
    }

    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return false;
    }

    setError(null);
    return true;
  };

  /**
   * Handle save
   */
  const handleSave = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const updates: UpdateBookshelfInput = {
        name: name.trim(),
        description: description.trim() || undefined,
        cover_color: coverColor,
        is_public: isPublic,
      };

      const success = await onSave(updates);
      if (success) {
        onClose();
      } else {
        setError('Failed to save changes. Please try again.');
      }
    } catch (err) {
      console.error('Failed to update bookshelf:', err);
      setError('Failed to save changes. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle close
   */
  const handleClose = () => {
    setError(null);
    onClose();
  };

  if (!bookshelf) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.headerButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Edit Bookshelf</Text>
          <Pressable
            onPress={handleSave}
            style={styles.headerButton}
            disabled={isLoading}
          >
            <Text style={[styles.saveText, isLoading && styles.saveTextDisabled]}>
              Save
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Name Input */}
          <Input
            label="Bookshelf Name *"
            placeholder="e.g., Fiction, To Read, Favorites"
            value={name}
            onChangeText={(text) => {
              setName(text);
              setError(null);
            }}
            error={error || undefined}
            maxLength={50}
          />

          {/* Description Input */}
          <Input
            label="Description"
            placeholder="What kind of books go here? (optional)"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          {/* Color Picker */}
          <View style={styles.colorSection}>
            <Text style={styles.colorLabel}>Shelf Color</Text>
            <View style={styles.colorGrid}>
              {BOOKSHELF_COLORS.map((color) => (
                <Pressable
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    isLightColor(color) && { borderColor: Colors.border },
                    coverColor === color && styles.colorOptionSelected,
                  ]}
                  onPress={() => setCoverColor(color)}
                  accessibilityRole="button"
                  accessibilityLabel={`Shelf color ${color}`}
                >
                  {coverColor === color && (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={isLightColor(color) ? Colors.text : Colors.textOnDark}
                    />
                  )}
                </Pressable>
              ))}
            </View>
          </View>

          {/* Privacy Toggle */}
          <View style={styles.privacySection}>
            <View style={styles.privacyHeader}>
              <Ionicons
                name={isPublic ? 'globe-outline' : 'lock-closed-outline'}
                size={20}
                color={Colors.text}
              />
              <Text style={styles.privacyLabel}>
                {isPublic ? 'Public Shelf' : 'Private Shelf'}
              </Text>
            </View>
            <View style={styles.privacyRow}>
              <View style={styles.privacyInfo}>
                <Text style={styles.privacyDescription}>
                  {isPublic
                    ? 'Anyone can view this bookshelf'
                    : 'Only you can view this bookshelf'}
                </Text>
              </View>
              <Switch
                value={isPublic}
                onValueChange={setIsPublic}
                trackColor={{ false: Colors.border, true: Colors.success }}
                thumbColor={Colors.background}
              />
            </View>
          </View>

          {/* Save Button (for keyboard users) */}
          <View style={styles.buttonContainer}>
            <Button
              title="Save Changes"
              onPress={handleSave}
              loading={isLoading}
              fullWidth
              size="lg"
            />
          </View>

          {/* Delete Bookshelf */}
          {onDelete && (
            <View style={styles.deleteContainer}>
              <Button
                title="Delete Bookshelf"
                variant="danger"
                onPress={onDelete}
                disabled={isLoading}
                fullWidth
                size="lg"
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerButton: {
    padding: Spacing.xs,
    minWidth: 60,
  },
  headerTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
  },
  cancelText: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
  },
  saveText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
    color: Colors.primary,
    textAlign: 'right',
  },
  saveTextDisabled: {
    color: Colors.textLight,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  colorSection: {
    marginBottom: Spacing.lg,
  },
  colorLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: Colors.text,
  },
  privacySection: {
    marginBottom: Spacing.lg,
    backgroundColor: Colors.backgroundDark,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  privacyLabel: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.medium,
    color: Colors.text,
    marginLeft: Spacing.sm,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  privacyInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  privacyDescription: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },
  buttonContainer: {
    marginTop: Spacing.lg,
  },
  deleteContainer: {
    marginTop: Spacing.md,
  },
});
