/**
 * Scan Screen
 *
 * Add a single book from a photo of its spine:
 * 1. Choose whether to take a photo or upload an existing one
 * 2. Capture/pick and crop the spine
 * 3. Read the spine text with Google Cloud Vision and match it to a real book
 *    (canonical title/author/ISBN) so the user doesn't have to type it in
 * 4. Confirm/adjust the details, upload the spine, and add the book
 *
 * Saving the canonical ISBNdb title/author (and ISBN) alongside the
 * uploaded spine is what lets other users' scans of the same book find and
 * reuse this spine image (see shelfScanService.attachExistingSpines and
 * booksService.getAlternativeSpines, which match on title/author/ISBN).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { storageService, booksService } from '@/services';
import { shelfScanService } from '@/services/shelfScan';
import { CameraScanner } from '@/components/CameraScanner';
import { Button, Input } from '@/components/ui';
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  getFontFamily,
  getSerifFontFamily,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

// 'pick' asks whether to take a photo or upload one; 'camera'/'gallery' hand
// off to the scanner; 'review' shows the identified book for confirmation.
type ScanMode = 'pick' | 'camera' | 'gallery' | 'review';

export default function ScanScreen() {
  const { shelfId } = useLocalSearchParams<{ shelfId: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [mode, setMode] = useState<ScanMode>('pick');

  // Review-phase state: the cropped spine plus the identified/edited details.
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [detectedText, setDetectedText] = useState('');
  const [matched, setMatched] = useState(false);

  /**
   * Read the spine text and match it to a real book, filling in the title,
   * author and ISBN. Silently degrades to manual entry if OCR isn't
   * configured or nothing matches.
   */
  const identifyBook = async (imageUri: string) => {
    if (!shelfScanService.isConfigured()) return;

    setIsIdentifying(true);
    try {
      const base64 = await shelfScanService.prepareImageForOcr(imageUri);
      if (!base64) return;

      const { data } = await shelfScanService.identifySpine(base64);
      if (!data) return;

      setDetectedText(data.detectedText);

      if (data.match) {
        setTitle(data.match.title);
        setAuthor(data.match.author);
        setIsbn(data.match.isbn);
        setCoverUrl(data.match.coverUrl);
        setMatched(true);
      } else if (data.detectedText) {
        // No confident match — offer the raw scanned text as a starting point.
        setTitle(data.detectedText);
      }
    } catch (error) {
      console.warn('Unable to identify book from spine:', error);
    } finally {
      setIsIdentifying(false);
    }
  };

  /**
   * Handle a cropped spine image: move to the review screen and try to
   * identify the book automatically.
   */
  const handleCapture = async (imageUri: string) => {
    setCapturedUri(imageUri);
    setTitle('');
    setAuthor('');
    setIsbn(null);
    setCoverUrl(null);
    setDetectedText('');
    setMatched(false);
    setMode('review');
    await identifyBook(imageUri);
  };

  /**
   * Upload the spine and create the book with the confirmed details.
   */
  const handleSave = async () => {
    if (!user?.id || !shelfId || !capturedUri) {
      Alert.alert('Error', 'Unable to add book. Please try again.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Title Required', 'Please enter a title for this book.');
      return;
    }

    setIsSaving(true);
    try {
      const uploadResult = await storageService.uploadBookSpine(capturedUri, user.id);
      if (uploadResult.error) {
        Alert.alert('Upload Failed', uploadResult.error.message);
        return;
      }

      const result = await booksService.createBook({
        title: title.trim(),
        author: author.trim(),
        isbn: isbn || undefined,
        image_url: uploadResult.data || undefined,
        shelf_id: shelfId,
        is_community: true, // Share the spine with the community by default
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
      setIsSaving(false);
    }
  };

  /**
   * Discard the current photo and go back to the take/upload chooser.
   */
  const handleRetake = () => {
    setCapturedUri(null);
    setMode('pick');
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
            Take a photo of a book spine or upload an existing one, then we&apos;ll read the
            title, match the book, and add it to this shelf. Best results come from a
            straight-on, well-lit photo.
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

  // Review / confirm the identified book
  if (mode === 'review') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.reviewContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.reviewImageRow}>
              {capturedUri && (
                <View style={[styles.spineFrame, { backgroundColor: colors.backgroundDark }]}>
                  <Image
                    source={{ uri: capturedUri }}
                    style={styles.spineImage}
                    contentFit="contain"
                  />
                </View>
              )}
              {coverUrl && (
                <View style={[styles.coverFrame, { backgroundColor: colors.backgroundDark }]}>
                  <Image
                    source={{ uri: coverUrl }}
                    style={styles.coverImage}
                    contentFit="contain"
                  />
                </View>
              )}
            </View>

            {isIdentifying ? (
              <View style={styles.identifyingBox}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.identifyingText, { color: colors.textSecondary }]}>
                  Reading the spine…
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.statusRow}>
                  <Ionicons
                    name={matched ? 'checkmark-circle' : 'information-circle-outline'}
                    size={18}
                    color={matched ? colors.success : colors.textSecondary}
                  />
                  <Text style={[styles.statusText, { color: colors.textSecondary }]}>
                    {matched
                      ? 'We matched this to a book. Fix anything that looks off.'
                      : 'We couldn’t match a book automatically. Check the details below.'}
                  </Text>
                </View>

                <Input
                  label="Title *"
                  placeholder="Book title"
                  value={title}
                  onChangeText={setTitle}
                  leftIcon="book-outline"
                  colors={colors}
                />
                <Input
                  label="Author"
                  placeholder="Author name"
                  value={author}
                  onChangeText={setAuthor}
                  leftIcon="person-outline"
                  colors={colors}
                />

                {detectedText ? (
                  <Text style={[styles.detectedText, { color: colors.textLight }]} numberOfLines={2}>
                    Scanned: {detectedText}
                  </Text>
                ) : null}
              </>
            )}
          </ScrollView>

          <View style={[styles.reviewFooter, { borderTopColor: colors.border }]}>
            <Button
              title="Add to Shelf"
              onPress={handleSave}
              loading={isSaving}
              disabled={isIdentifying}
              fullWidth
              size="lg"
              colors={colors}
            />
            <Button
              title="Retake Photo"
              variant="outline"
              onPress={handleRetake}
              disabled={isSaving}
              fullWidth
              colors={colors}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <CameraScanner
        onCapture={handleCapture}
        onCancel={handleScannerCancel}
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
  flex: {
    flex: 1,
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
  // Review phase
  reviewContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  reviewImageRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  spineFrame: {
    width: 80,
    height: 200,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  spineImage: {
    width: '100%',
    height: '100%',
  },
  coverFrame: {
    width: 130,
    height: 200,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  identifyingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  identifyingText: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('regular'),
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
    lineHeight: 18,
  },
  detectedText: {
    fontSize: Typography.sizes.xs,
    fontFamily: getFontFamily('regular'),
    fontStyle: 'italic',
  },
  reviewFooter: {
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
