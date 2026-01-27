/**
 * Create Bookshelf Screen
 *
 * Form for creating a new bookshelf.
 * Features:
 * - Name input
 * - Description (optional)
 * - Color picker
 * - Public/private toggle
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBookshelves } from '@/hooks/useBookshelves';
import { Button, Input } from '@/components/ui';
import { BOOKSHELF_COLORS } from '@/types';
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
} from '@/constants/theme';

export default function CreateBookshelfScreen() {
  const { createBookshelf } = useBookshelves();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState(BOOKSHELF_COLORS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
   * Submit form
   */
  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const result = await createBookshelf({
        name: name.trim(),
        description: description.trim() || undefined,
        cover_color: selectedColor,
      });

      if (result) {
        // Navigate to the new bookshelf
        router.replace(`/bookshelf/${result.id}`);
      } else {
        Alert.alert('Error', 'Failed to create bookshelf. Please try again.');
      }
    } catch (err) {
      console.error('Failed to create bookshelf:', err);
      Alert.alert('Error', 'Failed to create bookshelf. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.headerButton}>
              <Text style={styles.headerButtonText}>Cancel</Text>
            </Pressable>
          ),
        }}
      />

      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Preview */}
            <View style={styles.previewSection}>
              <View
                style={[styles.shelfPreview, { backgroundColor: selectedColor }]}
              >
                <Text style={styles.previewName} numberOfLines={1}>
                  {name || 'New Bookshelf'}
                </Text>
                <View style={styles.previewShelf}>
                  <View style={styles.previewShelfSurface} />
                </View>
              </View>
            </View>

            {/* Form */}
            <View style={styles.form}>
              <Input
                label="Bookshelf Name *"
                placeholder="e.g., Fiction, To Read, Favorites"
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  setError(null);
                }}
                error={error || undefined}
                leftIcon="library-outline"
                maxLength={50}
              />

              <Input
                label="Description"
                placeholder="What kind of books go here? (optional)"
                value={description}
                onChangeText={setDescription}
                leftIcon="document-text-outline"
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
                        selectedColor === color && styles.colorSelected,
                      ]}
                      onPress={() => setSelectedColor(color)}
                    >
                      {selectedColor === color && (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color={Colors.textInverse}
                        />
                      )}
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Submit Button */}
              <View style={styles.buttonContainer}>
                <Button
                  title="Create Bookshelf"
                  onPress={handleSubmit}
                  loading={isLoading}
                  fullWidth
                  size="lg"
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xxl,
  },
  headerButton: {
    padding: Spacing.xs,
  },
  headerButtonText: {
    color: Colors.textInverse,
    fontSize: Typography.sizes.md,
  },
  previewSection: {
    padding: Spacing.lg,
    backgroundColor: Colors.backgroundDark,
  },
  shelfPreview: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    height: 100,
    justifyContent: 'space-between',
  },
  previewName: {
    color: Colors.textInverse,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  previewShelf: {
    height: 30,
  },
  previewShelfSurface: {
    position: 'absolute',
    bottom: 0,
    left: -Spacing.md,
    right: -Spacing.md,
    height: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 2,
  },
  form: {
    padding: Spacing.lg,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSelected: {
    borderColor: Colors.text,
  },
  buttonContainer: {
    marginTop: Spacing.lg,
  },
});
