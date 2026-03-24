/**
 * Add Book Screen
 *
 * Manual book entry form.
 * Features:
 * - Title and author input
 * - Optional image picker
 * - ISBN field
 * - Community sharing toggle
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { booksService, storageService } from '@/services';
import { Button, Input } from '@/components/ui';
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  Shadows,
} from '@/constants/theme';


const GOOGLE_VISION_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY || '';

export default function AddBookScreen() {
  const { shelfId } = useLocalSearchParams<{ shelfId: string }>();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [shareWithCommunity, setShareWithCommunity] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; author?: string }>({});

  const tryAutoFillBookMetadata = async (asset: ImagePicker.ImagePickerAsset) => {
    // Don't overwrite user-entered values
    if (title.trim() && author.trim()) return;

    // Fast fallback: parse common filename patterns like "Title - Author.jpg"
    if (asset.fileName && (!title.trim() || !author.trim())) {
      const baseName = asset.fileName.replace(/\.[^.]+$/, '');
      const parts = baseName.split(/\s+-\s+/);
      if (parts.length >= 2) {
        if (!title.trim()) setTitle(parts[0].trim());
        if (!author.trim()) setAuthor(parts.slice(1).join(' - ').trim());
      }
    }

    if (!GOOGLE_VISION_API_KEY || !asset.uri) return;

    try {
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [
              {
                image: { source: { imageUri: asset.uri } },
                features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
              },
            ],
          }),
        }
      );

      if (!response.ok) return;

      const payload = await response.json();
      const text: string = payload?.responses?.[0]?.fullTextAnnotation?.text || '';
      if (!text) return;

      const lines = text
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 1 && !/^by$/i.test(line));

      if (!title.trim() && lines.length > 0) {
        setTitle(lines[0]);
      }

      if (!author.trim() && lines.length > 1) {
        const byLine = lines.find((line: string) => /^by\s+/i.test(line));
        if (byLine) {
          setAuthor(byLine.replace(/^by\s+/i, '').trim());
        } else {
          setAuthor(lines[1]);
        }
      }
    } catch (error) {
      console.warn('Unable to auto-fill metadata from image:', error);
    }
  };

  /**
   * Pick image from gallery
   */
  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]) {
        const selectedAsset = result.assets[0];
        setImageUri(selectedAsset.uri);
        await tryAutoFillBookMetadata(selectedAsset);
      }
    } catch (error) {
      console.error('Failed to pick image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  /**
   * Remove selected image
   */
  const handleRemoveImage = () => {
    setImageUri(null);
  };

  /**
   * Validate form
   */
  const validateForm = (): boolean => {
    const newErrors: { title?: string; author?: string } = {};

    if (!title.trim()) {
      newErrors.title = 'Title is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Submit form
   */
  const handleSubmit = async () => {
    if (!validateForm()) return;

    if (!shelfId) {
      Alert.alert('Error', 'No bookshelf selected');
      return;
    }

    setIsLoading(true);

    try {
      let uploadedImageUrl: string | undefined;

      // Upload image if provided
      if (imageUri && user?.id) {
        const uploadResult = await storageService.uploadBookSpine(
          imageUri,
          user.id
        );

        if (uploadResult.data) {
          uploadedImageUrl = uploadResult.data;
        } else if (uploadResult.error) {
          console.error('Image upload failed:', uploadResult.error);
          // Continue without image
        }
      }

      // Create the book
      const result = await booksService.createBook({
        title: title.trim(),
        author: author.trim(),
        isbn: isbn.trim() || undefined,
        image_url: uploadedImageUrl,
        shelf_id: shelfId,
        is_community: shareWithCommunity && !!uploadedImageUrl,
      });

      if (result.error) {
        Alert.alert('Error', result.error.message);
      } else {
        Alert.alert('Success', 'Book added to your shelf!', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.error('Failed to add book:', error);
      Alert.alert('Error', 'Failed to add book. Please try again.');
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
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Image Picker */}
            <View style={styles.imageSection}>
              {imageUri ? (
                <View style={styles.imagePreviewContainer}>
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.imagePreview}
                    contentFit="cover"
                  />
                  <Pressable
                    style={styles.removeImageButton}
                    onPress={handleRemoveImage}
                  >
                    <Ionicons name="close-circle" size={28} color={Colors.error} />
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.imagePicker} onPress={handlePickImage}>
                  <Ionicons name="image-outline" size={40} color={Colors.textSecondary} />
                  <Text style={styles.imagePickerText}>Add Book Spine Image</Text>
                  <Text style={styles.imagePickerHint}>(Optional)</Text>
                  <Text style={styles.imagePickerHint}>Can auto-fill title/author when detectable</Text>
                </Pressable>
              )}
            </View>

            {/* Form Fields */}
            <View style={styles.form}>
              <Input
                label="Title *"
                placeholder="Enter book title"
                value={title}
                onChangeText={setTitle}
                autoFocus
                error={errors.title}
                leftIcon="book-outline"
              />

              <Input
                label="Author"
                placeholder="Enter author name"
                value={author}
                onChangeText={setAuthor}
                error={errors.author}
                leftIcon="person-outline"
              />

              <Input
                label="ISBN"
                placeholder="Enter ISBN (optional)"
                value={isbn}
                onChangeText={setIsbn}
                leftIcon="barcode-outline"
                keyboardType="number-pad"
              />

              {/* Community Sharing Toggle */}
              {imageUri && (
                <View style={styles.toggleContainer}>
                  <View style={styles.toggleText}>
                    <Text style={styles.toggleLabel}>Share with Community</Text>
                    <Text style={styles.toggleHint}>
                      Allow others to add this book spine to their shelves
                    </Text>
                  </View>
                  <Switch
                    value={shareWithCommunity}
                    onValueChange={setShareWithCommunity}
                    trackColor={{ false: Colors.border, true: Colors.primary }}
                  />
                </View>
              )}

              {/* Submit Button */}
              <View style={styles.buttonContainer}>
                <Button
                  title="Add Book"
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
  imageSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.backgroundDark,
  },
  imagePicker: {
    width: 100,
    height: 160,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  imagePickerText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  imagePickerHint: {
    fontSize: Typography.sizes.xs,
    color: Colors.textLight,
    marginTop: 2,
  },
  imagePreviewContainer: {
    position: 'relative',
  },
  imagePreview: {
    width: 100,
    height: 160,
    borderRadius: BorderRadius.md,
    ...Shadows.md,
  },
  removeImageButton: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: Colors.background,
    borderRadius: 14,
  },
  form: {
    padding: Spacing.lg,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginTop: Spacing.sm,
  },
  toggleText: {
    flex: 1,
    marginRight: Spacing.md,
  },
  toggleLabel: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.medium,
    color: Colors.text,
  },
  toggleHint: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  buttonContainer: {
    marginTop: Spacing.xl,
  },
});
