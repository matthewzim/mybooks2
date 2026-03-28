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
  Switch,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBookshelves } from '@/hooks/useBookshelves';
import { Button, Input } from '@/components/ui';
import { BOOKSHELF_COLORS } from '@/types';
import type { ShelfStyle } from '@/types';
import {
  Spacing,
  BorderRadius,
  Typography,
  BookshelfDimensions,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

const SHELF_STYLE_OPTIONS: { id: ShelfStyle; label: string }[] = [
  { id: 'full', label: 'Classic Cabinet' },
  { id: 'bottom', label: 'Open Shelf' },
];

export default function CreateBookshelfScreen() {
  const { colors } = useTheme();
  const { createBookshelf } = useBookshelves();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState(BOOKSHELF_COLORS[0]);
  const [shelfStyle, setShelfStyle] = useState<ShelfStyle>('full');
  const [isPublic, setIsPublic] = useState(false);
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
        shelf_style: shelfStyle,
        is_public: isPublic,
      });

      if (result) {
        // Navigate to the new bookshelf
        router.replace({ pathname: '/bookshelf', params: { id: result.id } });
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
              <Text style={[styles.headerButtonText, { color: colors.textInverse }]}>Cancel</Text>
            </Pressable>
          ),
        }}
      />

      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Preview */}
            <View style={[styles.previewSection, { backgroundColor: colors.backgroundDark }]}>
              <View
                style={[styles.shelfPreview, { backgroundColor: selectedColor }]}
              >
                <Text style={[styles.previewName, { color: colors.textOnDark }]} numberOfLines={1}>
                  {name || 'New Bookshelf'}
                </Text>
                <View style={styles.previewShelf}>
                  <View style={[styles.previewShelfSurface, { backgroundColor: colors.overlay }]} />
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
                autoFocus
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
                <Text style={[styles.colorLabel, { color: colors.text }]}>Shelf Color</Text>
                <View style={styles.colorGrid}>
                  {BOOKSHELF_COLORS.map((color) => (
                    <Pressable
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        selectedColor === color && { borderColor: colors.text },
                      ]}
                      onPress={() => setSelectedColor(color)}
                    >
                      {selectedColor === color && (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color={colors.textOnDark}
                        />
                      )}
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Shelf Style Picker */}
              <View style={styles.styleSection}>
                <Text style={[styles.colorLabel, { color: colors.text }]}>Shelf Style</Text>
                <View style={styles.styleRow}>
                  {SHELF_STYLE_OPTIONS.map((option) => (
                    <Pressable
                      key={option.id}
                      style={[
                        styles.styleCard,
                        {
                          backgroundColor: colors.card,
                          borderColor: shelfStyle === option.id ? colors.text : colors.border,
                          borderWidth: shelfStyle === option.id ? 2 : 1,
                        },
                      ]}
                      onPress={() => setShelfStyle(option.id)}
                    >
                      {/* Mini shelf preview */}
                      <View
                        style={[
                          styles.miniShelf,
                          option.id === 'full' && {
                            borderWidth: 3,
                            borderColor: BookshelfDimensions.shelfColor,
                          },
                        ]}
                      >
                        {option.id === 'full' && (
                          <View style={[styles.miniBack, { backgroundColor: BookshelfDimensions.backColor }]} />
                        )}
                        <View style={styles.miniBooks}>
                          {[
                            { color: '#8B0000', h: 42 },
                            { color: '#00008B', h: 50 },
                            { color: '#006400', h: 38 },
                            { color: '#4B0082', h: 46 },
                            { color: '#8B4513', h: 44 },
                          ].map((b, i) => (
                            <View key={i} style={[styles.miniSpine, { backgroundColor: b.color, height: b.h }]} />
                          ))}
                        </View>
                        {option.id === 'bottom' && (
                          <View style={styles.miniShelfBar} />
                        )}
                      </View>
                      <Text style={[styles.styleLabel, { color: colors.text }]}>{option.label}</Text>
                      {shelfStyle === option.id && (
                        <View style={styles.styleCheck}>
                          <Ionicons name="checkmark-circle" size={18} color={colors.text} />
                        </View>
                      )}
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Privacy Toggle */}
              <View style={[styles.privacySection, { backgroundColor: colors.backgroundDark }]}>
                <View style={styles.privacyHeader}>
                  <Ionicons
                    name={isPublic ? 'globe-outline' : 'lock-closed-outline'}
                    size={20}
                    color={colors.text}
                  />
                  <Text style={[styles.privacyLabel, { color: colors.text }]}>
                    {isPublic ? 'Public Shelf' : 'Private Shelf'}
                  </Text>
                </View>
                <View style={styles.privacyRow}>
                  <View style={styles.privacyInfo}>
                    <Text style={[styles.privacyDescription, { color: colors.textSecondary }]}>
                      {isPublic
                        ? 'Anyone can view this bookshelf'
                        : 'Only you can view this bookshelf'}
                    </Text>
                  </View>
                  <Switch
                    value={isPublic}
                    onValueChange={setIsPublic}
                    trackColor={{ false: colors.border, true: colors.success }}
                    thumbColor={colors.background}
                  />
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
    fontSize: Typography.sizes.md,
  },
  previewSection: {
    padding: Spacing.lg,
  },
  shelfPreview: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    height: 100,
    justifyContent: 'space-between',
  },
  previewName: {
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
  styleSection: {
    marginBottom: Spacing.lg,
  },
  styleRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  styleCard: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  miniShelf: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
  },
  miniBack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  miniBooks: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    minHeight: 55,
    paddingHorizontal: 4,
  },
  miniSpine: {
    width: 16,
    borderRadius: 1,
  },
  miniShelfBar: {
    height: 5,
    backgroundColor: BookshelfDimensions.shelfColor,
    marginTop: -1,
  },
  styleLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
  },
  styleCheck: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
  },
  privacySection: {
    marginBottom: Spacing.lg,
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
  },
  buttonContainer: {
    marginTop: Spacing.lg,
  },
});
