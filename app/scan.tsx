/**
 * Scan Screen
 *
 * Add a single book from a photo of its spine:
 * 1. Choose whether to take a photo or upload an existing one
 * 2. Capture/pick and crop the spine
 * 3. Upload to Supabase storage
 * 4. Add book with captured image
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { storageService, booksService } from '@/services';
import { CameraScanner } from '@/components/CameraScanner';
import { Button } from '@/components/ui';
import {
  Colors,
  Spacing,
  Typography,
  getFontFamily,
  getSerifFontFamily,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

// 'pick' asks whether to take a photo or upload one; the other modes hand off
// to the camera/gallery scanner.
type ScanMode = 'pick' | 'camera' | 'gallery';

export default function ScanScreen() {
  const { shelfId } = useLocalSearchParams<{ shelfId: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [isUploading, setIsUploading] = useState(false);
  const [mode, setMode] = useState<ScanMode>('pick');

  /**
   * Handle captured image
   * Uploads to storage and prompts for book details
   */
  const handleCapture = async (imageUri: string) => {
    if (!user?.id || !shelfId) {
      Alert.alert('Error', 'Unable to add book. Please try again.');
      return;
    }

    setIsUploading(true);

    try {
      // Upload image to Supabase storage
      const uploadResult = await storageService.uploadBookSpine(imageUri, user.id);

      if (uploadResult.error) {
        Alert.alert('Upload Failed', uploadResult.error.message);
        return;
      }

      const imageUrl = uploadResult.data;

      // Prompt for book details
      Alert.prompt(
        'Book Title',
        'Enter the title of this book:',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => router.back() },
          {
            text: 'Next',
            onPress: (title) => {
              if (!title?.trim()) {
                Alert.alert('Error', 'Title is required');
                return;
              }

              // Prompt for author
              Alert.prompt(
                'Author',
                'Enter the author of this book:',
                [
                  {
                    text: 'Skip',
                    style: 'cancel',
                    onPress: () => createBook(title.trim(), '', imageUrl),
                  },
                  {
                    text: 'Done',
                    onPress: (author) =>
                      createBook(title.trim(), author?.trim() || '', imageUrl),
                  },
                ],
                'plain-text'
              );
            },
          },
        ],
        'plain-text'
      );
    } catch (error) {
      console.error('Failed to process image:', error);
      Alert.alert('Error', 'Failed to process the image. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * Create book with the uploaded image
   */
  const createBook = async (
    title: string,
    author: string,
    imageUrl: string | null
  ) => {
    if (!shelfId) return;

    try {
      const result = await booksService.createBook({
        title,
        author,
        image_url: imageUrl || undefined,
        shelf_id: shelfId,
        is_community: true, // Share with community by default
      });

      if (result.error) {
        Alert.alert('Error', result.error.message);
      } else {
        Alert.alert('Success', 'Book added to your shelf!', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to add book. Please try again.');
    }
  };

  /**
   * Handle cancel from the scanner - return to the pick screen so the user
   * can switch between taking and uploading a photo
   */
  const handleScannerCancel = () => {
    setMode('pick');
  };

  // Take-a-photo / upload-existing-photo chooser
  if (mode === 'pick') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.pickContainer}>
          <View style={[styles.heroIcon, { backgroundColor: colors.backgroundDark }]}>
            <Ionicons name="book-outline" size={44} color={colors.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Scan a book</Text>
          <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
            Take a photo of a book spine or upload an existing one, then we&apos;ll add it
            to this shelf. Best results come from a straight-on, well-lit photo.
          </Text>

          <View style={styles.pickActions}>
            <Button
              title="Take Photo"
              onPress={() => setMode('camera')}
              fullWidth
              size="lg"
              colors={colors}
            />
            <Button
              title="Upload Existing Photo"
              variant="outline"
              onPress={() => setMode('gallery')}
              fullWidth
              size="lg"
              colors={colors}
            />
          </View>
        </View>

        <Pressable style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <CameraScanner
        onCapture={handleCapture}
        onCancel={handleScannerCancel}
        isUploading={isUploading}
        initialMode={mode === 'gallery' ? 'gallery' : 'camera'}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  pickContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  heroIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 24,
    fontFamily: getSerifFontFamily('medium'),
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('regular'),
    textAlign: 'center',
    lineHeight: 22,
  },
  pickActions: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  cancelButton: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('medium'),
  },
});
