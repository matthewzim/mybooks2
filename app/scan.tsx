/**
 * Scan Screen
 *
 * Camera screen for scanning book spines.
 * Features:
 * - Camera capture
 * - Gallery picker
 * - Upload to Supabase storage
 * - Add book with captured image
 */

import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { storageService, booksService } from '@/services';
import { CameraScanner } from '@/components/CameraScanner';
import { Colors, Spacing } from '@/constants/theme';

export default function ScanScreen() {
  const { shelfId } = useLocalSearchParams<{ shelfId: string }>();
  const { user } = useAuth();
  const [isUploading, setIsUploading] = useState(false);

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
   * Handle cancel
   */
  const handleCancel = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <CameraScanner
        onCapture={handleCapture}
        onCancel={handleCancel}
        isUploading={isUploading}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
});
