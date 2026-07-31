/**
 * BookDetailModal Component
 *
 * A minimal modal for viewing and editing book details.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useSpineImageUrl } from '@/hooks/useSpineImageUrl';
import { booksService } from '@/services/books';
import { bookDedupeKey, isbndbService, needsCoverUpgrade } from '@/services/isbndb';
import { getCoverImageUrl, storageService } from '@/services/storage';
import { CommunitySpineBrowserModal } from '@/components/CommunitySpineBrowserModal';
import { Button, Rating } from '@/components/ui';
import {
  BorderRadius,
  Spacing,
  Typography,
  getFontFamily,
  getSerifFontFamily,
  serifItalicStyle,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { getClothColor } from '@/utils/spineCloth';
import { normalizeAuthorName, normalizeBookTitle } from '@/utils/bookText';
import type { Book, CommunityBookSpine } from '@/types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = Math.min(SCREEN_HEIGHT * 0.88, 720);
// Height of the drag-handle strip at the top of the sheet. In view mode the
// scroll view slides under it so the cover shadow can bleed into that area.
const SHEET_HANDLE_HEIGHT = Spacing.xs * 4 + 5;

interface BookDetailModalProps {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
  onBookUpdated?: (book: Book) => void;
  onBookDeleted?: (bookId: string) => void;
  readOnly?: boolean;
}

const getBookColor = getClothColor;

/** Identifies the text a book's cover image was last searched with. */
function coverSearchKey(book: Pick<Book, 'book_id' | 'title' | 'author'>): string {
  return `${book.book_id}|${bookDedupeKey(book.title, book.author)}`;
}

function AlternateSpineOption({
  option,
  isUpdating,
  onSelect,
}: {
  option: CommunityBookSpine;
  isUpdating: boolean;
  onSelect: (option: CommunityBookSpine) => void;
}) {
  const { colors } = useTheme();
  const resolvedImageUrl = useSpineImageUrl(option.image_url);
  const backgroundColor = getBookColor(option.title);

  return (
    <Pressable
      style={[
        styles.spineOptionButton,
        {
          borderColor: colors.inputBorder,
          backgroundColor: colors.card,
        },
      ]}
      onPress={() => onSelect(option)}
      disabled={isUpdating}
    >
      {resolvedImageUrl ? (
        // "contain" shows the whole spine at its true aspect ratio instead
        // of a blown-up crop, so users can tell what the spine looks like.
        <View style={[styles.spineOptionImage, styles.spineOptionImageFrame, { backgroundColor: colors.backgroundDark }]}>
          <Image source={{ uri: resolvedImageUrl }} style={styles.spineOptionImageInner} contentFit="contain" />
        </View>
      ) : (
        <View style={[styles.spineOptionImage, styles.spineOptionPlaceholder, { backgroundColor }]}>
          <Text style={[styles.spineOptionTitle, { color: colors.textOnDark }]} numberOfLines={3}>
            {option.title}
          </Text>
          <Text style={[styles.spineOptionAuthor, { color: colors.textOnDarkMuted }]} numberOfLines={2}>
            {option.author}
          </Text>
        </View>
      )}
      <Text style={[styles.spineOptionLabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {option.uploader_name ? `By ${option.uploader_name}` : 'Use this spine'}
      </Text>
    </Pressable>
  );
}

export function BookDetailModal({
  visible,
  book,
  onClose,
  onBookUpdated,
  onBookDeleted,
  readOnly = false,
}: BookDetailModalProps) {
  const { colors } = useTheme();
  const { user } = useAuth();

  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdatingSpine, setIsUpdatingSpine] = useState(false);
  const [showCommunityBrowser, setShowCommunityBrowser] = useState(false);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [review, setReview] = useState('');
  const [rating, setRating] = useState(0);

  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [isCoverLoading, setIsCoverLoading] = useState(false);
  const [alternativeSpines, setAlternativeSpines] = useState<CommunityBookSpine[]>([]);
  const [isLoadingAlternativeSpines, setIsLoadingAlternativeSpines] = useState(false);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(SHEET_MAX_HEIGHT)).current;
  const isClosingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const scrollOffsetRef = useRef(0);
  const coverUrlCacheRef = useRef<Record<string, string>>({});
  // Cover search key of a save that already re-ran the cover search itself
  // (the title or author changed, so `updateBook` looked the cover up again).
  // Without it the effect below would immediately repeat that same lookup
  // whenever the corrected text still matched nothing — and repeat it again
  // on every reopen, since an on-demand fetch deliberately ignores the
  // service's miss cache. Another edit changes the key, so the next
  // correction is still looked up.
  const coverRefetchedOnSaveRef = useRef<string | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const resolvedSpineImageUrl = useSpineImageUrl(book?.image_url);

  useEffect(() => {
    if (book) {
      setTitle(book.title || '');
      setAuthor(book.author || '');
      setReview(book.review || '');
      setRating(book.rating || 0);
      setIsEditing(false);
      setCoverImageUrl(book.cover_image_url || null);
    }
  }, [book]);

  // Fetch cover image when the modal opens.
  // If the caller has stale data, the service re-checks Supabase for an existing cached cover
  // before calling ISBNdb again.
  useEffect(() => {
    if (!visible || !book) return;

    let cancelled = false;
    // The key includes the stored URL so a background upgrade (which changes
    // cover_image_url) isn't masked by a stale cached resolution.
    const coverCacheKey = `${book.book_id}:${book.cover_image_url ?? ''}`;

    const cachedCoverForBook = coverUrlCacheRef.current[coverCacheKey];
    if (cachedCoverForBook) {
      setCoverImageUrl(cachedCoverForBook);
      return;
    }

    // Already have an up-to-date cached cover — resolve its URL
    // (handles signed URLs for private buckets)
    if (book.cover_image_url && !needsCoverUpgrade(book.cover_image_url)) {
      getCoverImageUrl(book.cover_image_url).then((resolved) => {
        if (!cancelled && resolved) {
          coverUrlCacheRef.current[coverCacheKey] = resolved;
          setCoverImageUrl(resolved);
        }
      });
      return;
    }

    // The save that corrected this book's title or author already searched
    // for a cover with exactly this text and came back empty-handed; asking
    // again here would spend the same requests on the same answer.
    if (coverRefetchedOnSaveRef.current === coverSearchKey(book)) {
      if (book.cover_image_url) {
        getCoverImageUrl(book.cover_image_url).then((resolved) => {
          if (!cancelled && resolved) setCoverImageUrl(resolved);
        });
      } else {
        setCoverImageUrl(null);
      }
      return () => {
        cancelled = true;
      };
    }

    // No cover yet, or one cached by the old low-quality pipeline: fetch the
    // high-quality version. A legacy cover is shown while the fetch runs so
    // the modal never regresses to a spinner over a book that had an image.
    let fetchCompleted = false;
    if (book.cover_image_url) {
      getCoverImageUrl(book.cover_image_url).then((resolved) => {
        if (!cancelled && resolved && !fetchCompleted) {
          setCoverImageUrl(resolved);
        }
      });
    } else {
      setIsCoverLoading(true);
    }

    isbndbService
      .fetchAndCacheCover(
        {
          book_id: book.book_id,
          title: book.title,
          author: book.author,
        },
        // User is looking at this book right now — don't let a background
        // prefetch's rate-limit cooldown block the fetch.
        { bypassCooldown: true }
      )
      .then(async (result) => {
        if (cancelled) return;
        if (result.data) {
          // If the returned URL is a direct external URL (ISBNdb's image
          // host, when caching to Supabase failed), use it directly instead
          // of running through Supabase URL resolution.
          const isExternalUrl = result.data.startsWith('https://images.isbndb.com');
          const resolved = isExternalUrl
            ? result.data
            : await getCoverImageUrl(result.data);
          if (!cancelled && resolved) {
            fetchCompleted = true;
            coverUrlCacheRef.current[coverCacheKey] = resolved;
            setCoverImageUrl(resolved);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setIsCoverLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, book]);

  // Slide the sheet up from the bottom of the screen when it opens
  useEffect(() => {
    if (visible && book) {
      isClosingRef.current = false;
      scrollOffsetRef.current = 0;
      overlayOpacity.setValue(0);
      cardTranslateY.setValue(SHEET_MAX_HEIGHT);

      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(cardTranslateY, {
          toValue: 0,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, book, overlayOpacity, cardTranslateY]);

  useEffect(() => {
    if (!visible || !book || !isEditing) {
      setAlternativeSpines([]);
      setIsLoadingAlternativeSpines(false);
      return;
    }

    let cancelled = false;

    setIsLoadingAlternativeSpines(true);
    booksService
      .getAlternativeSpines(book)
      .then((result) => {
        if (cancelled) return;
        setAlternativeSpines(result.data || []);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAlternativeSpines(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, book, isEditing]);

  // Slide the sheet back down off-screen, then notify the caller
  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: SHEET_MAX_HEIGHT,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      isClosingRef.current = false;
      onCloseRef.current();
    });
  }, [overlayOpacity, cardTranslateY]);

  const springSheetBack = useCallback(() => {
    Animated.spring(cardTranslateY, {
      toValue: 0,
      tension: 120,
      friction: 16,
      useNativeDriver: true,
    }).start();
  }, [cardTranslateY]);

  const handleDragMove = useCallback(
    (dy: number) => {
      cardTranslateY.setValue(Math.max(0, dy));
    },
    [cardTranslateY]
  );

  const handleDragRelease = useCallback(
    (dy: number, vy: number) => {
      if (dy > SHEET_MAX_HEIGHT * 0.2 || vy > 0.9) {
        handleClose();
      } else {
        springSheetBack();
      }
    },
    [handleClose, springSheetBack]
  );

  // Drag handle at the top of the sheet: always draggable
  const handlePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 4,
        onPanResponderMove: (_evt, gesture) => handleDragMove(gesture.dy),
        onPanResponderRelease: (_evt, gesture) => handleDragRelease(gesture.dy, gesture.vy),
        onPanResponderTerminate: springSheetBack,
      }),
    [handleDragMove, handleDragRelease, springSheetBack]
  );

  // Whole-sheet drag: takes over only when pulling down while the inner
  // scroll view is already at the top, so normal scrolling keeps working.
  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_evt, gesture) =>
          gesture.dy > 6 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.5 &&
          scrollOffsetRef.current <= 0,
        onPanResponderMove: (_evt, gesture) => handleDragMove(gesture.dy),
        onPanResponderRelease: (_evt, gesture) => handleDragRelease(gesture.dy, gesture.vy),
        onPanResponderTerminate: springSheetBack,
      }),
    [handleDragMove, handleDragRelease, springSheetBack]
  );

  const handleSave = async () => {
    if (!book) return;

    if (!title.trim()) {
      Alert.alert('Error', 'Title is required');
      return;
    }

    setIsSaving(true);
    const previousCoverSearchKey = coverSearchKey(book);
    try {
      const result = await booksService.updateBook(book.id, {
        title: normalizeBookTitle(title),
        author: normalizeAuthorName(author),
        review: review.trim() || null,
        rating: rating || null,
      });

      if (result.data) {
        // A corrected title or author is the usual fix for a book with no
        // cover, so `updateBook` re-runs the cover search for it — that's why
        // saving one can take a moment, and why the effect above shouldn't
        // repeat the search when it found nothing.
        const savedCoverSearchKey = coverSearchKey(result.data);
        if (savedCoverSearchKey !== previousCoverSearchKey) {
          coverRefetchedOnSaveRef.current = savedCoverSearchKey;
        }
        onBookUpdated?.(result.data);
        setIsEditing(false);
        Alert.alert('Success', 'Book updated successfully');
      } else if (result.error) {
        Alert.alert('Error', result.error.message);
      }
    } catch {
      Alert.alert('Error', 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (book) {
      setTitle(book.title);
      setAuthor(book.author);
      setReview(book.review || '');
      setRating(book.rating || 0);
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    Alert.alert('Delete Book', 'Are you sure you want to remove this book from your shelf?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!book) return;

          try {
            const result = await booksService.deleteBook(book.id);
            if (!result.error) {
              onBookDeleted?.(book.id);
              handleClose();
            } else {
              Alert.alert('Error', result.error.message);
            }
          } catch {
            Alert.alert('Error', 'Failed to delete book');
          }
        },
      },
    ]);
  };

  const handleSelectExistingSpine = async (option: CommunityBookSpine) => {
    if (!book || !option.image_url || isUpdatingSpine) return;

    setIsUpdatingSpine(true);
    try {
      // Community books are owned by their uploader, so a plain image_url
      // update is silently blocked by RLS. This re-points the user's shelf
      // item at the book row that carries the selected spine instead.
      const result = await booksService.setBookSpineFromCommunity(book.id, option);

      if (result.data) {
        onBookUpdated?.(result.data);
        Alert.alert('Spine Updated', 'This book now uses the selected spine image.');
      } else if (result.error) {
        Alert.alert('Error', result.error.message);
      }
    } catch {
      Alert.alert('Error', 'Failed to update the book spine.');
    } finally {
      setIsUpdatingSpine(false);
    }
  };

  const handleCommunitySpineSelect = async (option: CommunityBookSpine) => {
    await handleSelectExistingSpine(option);
    setShowCommunityBrowser(false);
  };

  const handleScanNewSpine = async () => {
    if (!book || !user?.id || isUpdatingSpine) {
      Alert.alert('Error', 'Unable to scan a new spine right now.');
      return;
    }

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera Required', 'Please enable camera access to scan a new book spine.');
        return;
      }

      const captureResult = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 3],
      });

      if (captureResult.canceled || !captureResult.assets?.[0]?.uri) {
        return;
      }

      setIsUpdatingSpine(true);

      const uploadResult = await storageService.uploadBookSpine(captureResult.assets[0].uri, user.id);
      if (uploadResult.error || !uploadResult.data) {
        Alert.alert('Upload Failed', uploadResult.error?.message || 'Failed to upload spine image.');
        return;
      }

      const updateResult = await booksService.updateBook(book.id, {
        image_url: uploadResult.data,
      });

      if (updateResult.data) {
        onBookUpdated?.(updateResult.data);
        Alert.alert('Spine Updated', 'Your new scanned spine has been saved for this book.');
      } else {
        Alert.alert('Error', updateResult.error?.message || 'Failed to update the book spine.');
      }
    } catch {
      Alert.alert('Error', 'Failed to scan a new spine.');
    } finally {
      setIsUpdatingSpine(false);
    }
  };

  const handleUploadNewSpine = async () => {
    if (!book || !user?.id || isUpdatingSpine) {
      Alert.alert('Error', 'Unable to upload a new spine right now.');
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photos Access Required', 'Please enable photo library access to upload a book spine.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 3],
      });

      if (pickerResult.canceled || !pickerResult.assets?.[0]?.uri) {
        return;
      }

      setIsUpdatingSpine(true);

      const uploadResult = await storageService.uploadBookSpine(pickerResult.assets[0].uri, user.id);
      if (uploadResult.error || !uploadResult.data) {
        Alert.alert('Upload Failed', uploadResult.error?.message || 'Failed to upload spine image.');
        return;
      }

      const updateResult = await booksService.updateBook(book.id, {
        image_url: uploadResult.data,
      });

      if (updateResult.data) {
        onBookUpdated?.(updateResult.data);
        Alert.alert('Spine Updated', 'Your uploaded spine has been saved for this book.');
      } else {
        Alert.alert('Error', updateResult.error?.message || 'Failed to update the book spine.');
      }
    } catch {
      Alert.alert('Error', 'Failed to upload a new spine.');
    } finally {
      setIsUpdatingSpine(false);
    }
  };

  if (!book) return null;

  const displayTitle = book.title?.trim() || 'Untitled';
  const displayAuthor = book.author?.trim() || 'Unknown Author';
  const bookColor = getBookColor(displayTitle);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity, backgroundColor: colors.overlay }]}>
        <Pressable style={styles.backdropPress} onPress={handleClose} accessible={false} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} pointerEvents="box-none" style={styles.keyboardView}>
          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: colors.background,
                transform: [{ translateY: cardTranslateY }],
              },
            ]}
            {...sheetPanResponder.panHandlers}
          >
            <View style={styles.sheetHandle} {...handlePanResponder.panHandlers}>
              <View style={styles.grabber} />
            </View>

            {isEditing && (
              <View style={[styles.headerRow, { borderBottomColor: colors.borderLight }]}>
                <Text style={[styles.pageTitle, { color: colors.text }]}>Edit Book</Text>
              </View>
            )}

            <ScrollView
              style={[styles.scrollView, !isEditing && styles.scrollViewUnderHandle]}
              contentContainerStyle={[styles.scrollContent, !isEditing && styles.scrollContentUnderHandle]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScroll={(event) => {
                scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
            >
              {isEditing ? (
                <>
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.text }]}>Title</Text>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.inputBackground,
                          borderColor: colors.inputBorder,
                          color: colors.text,
                        },
                      ]}
                      value={title}
                      onChangeText={setTitle}
                      // Re-case on blur rather than on every keystroke, which
                      // would fight the user mid-word.
                      onBlur={() => setTitle(normalizeBookTitle(title))}
                      placeholder="Book title"
                      placeholderTextColor={colors.textLight}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.text }]}>Author</Text>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.inputBackground,
                          borderColor: colors.inputBorder,
                          color: colors.text,
                        },
                      ]}
                      value={author}
                      onChangeText={setAuthor}
                      onBlur={() => setAuthor(normalizeAuthorName(author))}
                      placeholder="Author name"
                      placeholderTextColor={colors.textLight}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.text }]}>Your Rating</Text>
                    <Rating value={rating} onChange={setRating} size={28} />
                  </View>

                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.text }]}>Your Review</Text>
                    <TextInput
                      style={[
                        styles.input,
                        styles.textArea,
                        {
                          backgroundColor: colors.inputBackground,
                          borderColor: colors.inputBorder,
                          color: colors.text,
                        },
                      ]}
                      value={review}
                      onChangeText={setReview}
                      placeholder="Write your thoughts..."
                      placeholderTextColor={colors.textLight}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.text }]}>Book Spine</Text>
                    <View style={[styles.spineManagerCard, { backgroundColor: colors.bookBase, borderColor: colors.inputBorder }]}>
                      <View style={styles.spineManagerHeader}>
                        <View style={[styles.currentSpinePreview, { backgroundColor: bookColor }]}>
                          {resolvedSpineImageUrl ? (
                            <Image source={{ uri: resolvedSpineImageUrl }} style={styles.currentSpineImage} contentFit="cover" />
                          ) : (
                            <View style={[styles.currentSpineImage, styles.spineOptionPlaceholder, { backgroundColor: bookColor }]}>
                              <Text style={[styles.spineOptionTitle, { color: colors.textOnDark }]} numberOfLines={3}>
                                {displayTitle}
                              </Text>
                              <Text style={[styles.spineOptionAuthor, { color: colors.textOnDarkMuted }]} numberOfLines={2}>
                                {displayAuthor}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.spineManagerActions}>
                          <Button
                            title="Scan New Spine"
                            onPress={handleScanNewSpine}
                            loading={isUpdatingSpine}
                            style={styles.spineManagerActionButton}
                          />
                          <Button
                            title="Upload New Spine"
                            onPress={handleUploadNewSpine}
                            loading={isUpdatingSpine}
                            style={styles.spineManagerActionButton}
                          />
                          <Button
                            title="Browse Community"
                            variant="outline"
                            onPress={() => setShowCommunityBrowser(true)}
                            disabled={isUpdatingSpine}
                            style={styles.spineManagerActionButton}
                          />
                        </View>
                      </View>

                      <Text style={[styles.spineManagerHelpText, { color: colors.textSecondary }]}>
                        Pick another saved spine for this book, scan a new one with your camera, or upload one from your photos.
                      </Text>

                      {isLoadingAlternativeSpines ? (
                        <View style={styles.spineStatusRow}>
                          <ActivityIndicator size="small" color={colors.primary} />
                          <Text style={[styles.spineStatusText, { color: colors.textSecondary }]}>Loading saved spine options…</Text>
                        </View>
                      ) : alternativeSpines.length > 0 ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.spineOptionsRow}
                        >
                          {alternativeSpines.map((option: CommunityBookSpine) => (
                            <AlternateSpineOption
                              key={option.id}
                              option={option}
                              isUpdating={isUpdatingSpine}
                              onSelect={handleSelectExistingSpine}
                            />
                          ))}
                        </ScrollView>
                      ) : (
                        <Text style={[styles.spineEmptyText, { color: colors.textSecondary }]}>
                          No other saved spine images were found for this book yet.
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.editButtons}>
                    <Button title="Cancel" variant="outline" onPress={handleCancel} style={styles.editButton} />
                    <Button title="Save" onPress={handleSave} loading={isSaving} style={styles.editButton} />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.topSection}>
                    <View style={styles.coverShadow}>
                      <View style={styles.coverShell}>
                        {coverImageUrl ? (
                          <Image
                            source={{ uri: coverImageUrl }}
                            style={styles.coverImage}
                            contentFit="cover"
                            transition={200}
                            onError={() => setCoverImageUrl(null)}
                          />
                        ) : isCoverLoading ? (
                          <View style={[styles.coverImage, styles.thumbnailPlaceholder, { backgroundColor: bookColor }]}>
                            <Text style={[styles.coverLoadingText, { color: colors.textOnDark }]}>Loading cover…</Text>
                          </View>
                        ) : (
                          <View style={[styles.coverImage, styles.thumbnailPlaceholder, { backgroundColor: bookColor }]}>
                            <Text style={[styles.placeholderInitial, { color: colors.textOnDark }]}>
                              {displayTitle.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <LinearGradient
                          colors={[
                            'rgba(0, 0, 0, 0.28)',
                            'rgba(255, 255, 255, 0.14)',
                            'rgba(0, 0, 0, 0.16)',
                          ]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.spineEdge}
                          pointerEvents="none"
                        />
                      </View>
                    </View>
                    <Text style={[styles.bookTitle, { color: colors.text }]}>{displayTitle}</Text>
                    <Text style={[styles.bookAuthor, { color: colors.textSecondary }]}>by {displayAuthor}</Text>
                  </View>

                  <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Rating value={book.rating || 0} readonly size={20} colors={colors} />
                    <Text style={[styles.ratingText, { color: colors.textSecondary }]}>
                      {book.rating ? `Your rating · ${book.rating.toFixed(1)}` : 'Not rated yet'}
                    </Text>
                  </View>

                  <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.reviewLabel, { color: colors.textSecondary }]}>Review</Text>
                    {book.review ? (
                      <Text style={styles.reviewText}>&ldquo;{book.review}&rdquo;</Text>
                    ) : (
                      <Text style={[styles.reviewText, { color: colors.textSecondary }]}>No review yet.</Text>
                    )}
                  </View>

                  <View style={[styles.metadata, { borderTopColor: colors.borderLight }]}>
                    {book.isbn && (
                      <View style={styles.metadataItem}>
                        <Text style={[styles.metadataLabel, { color: colors.textLight }]}>ISBN</Text>
                        <Text style={[styles.metadataValue, { color: colors.text }]}>{book.isbn}</Text>
                      </View>
                    )}
                    <View style={styles.metadataItem}>
                      <Text style={[styles.metadataLabel, { color: colors.textLight }]}>ADDED</Text>
                      <Text style={[styles.metadataValue, { color: colors.text }]}>
                        {new Date(book.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>
                  </View>

                  {!readOnly && (
                    <View style={styles.actionsRow}>
                      <View style={styles.editButtonWrap}>
                        <Button
                          title="Edit book"
                          onPress={() => setIsEditing(true)}
                          fullWidth
                          style={{
                            ...styles.editBookButton,
                            backgroundColor: colors.primary,
                            borderColor: colors.primary,
                          }}
                          textStyle={{ color: colors.textInverse }}
                          colors={colors}
                        />
                      </View>
                      <Pressable
                        onPress={handleDelete}
                        style={({ pressed }) => [
                          styles.deleteButton,
                          { backgroundColor: colors.card, borderColor: colors.dangerBorder },
                          pressed && { backgroundColor: colors.dangerBg },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Delete book"
                      >
                        <Ionicons name="trash-outline" size={22} color={colors.error} />
                      </Pressable>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>

      <CommunitySpineBrowserModal
        visible={showCommunityBrowser}
        book={book}
        isUpdatingSpine={isUpdatingSpine}
        onSelect={handleCommunitySpineSelect}
        onClose={() => setShowCommunityBrowser(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  keyboardView: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    maxHeight: SHEET_MAX_HEIGHT,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
    paddingTop: Spacing.xs,
  },
  sheetHandle: {
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    // Stay above the scroll view, which slides underneath in view mode
    zIndex: 10,
  },
  grabber: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#d8ccb6',
    marginVertical: Spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  pageTitle: {
    fontSize: 20,
    fontFamily: getSerifFontFamily('medium'),
  },
  scrollView: {
    flexGrow: 0,
  },
  // In view mode the scroll view extends up under the drag handle so the
  // cover shadow isn't clipped at the handle boundary; the extra content
  // padding keeps the cover in the same visual spot.
  scrollViewUnderHandle: {
    marginTop: -SHEET_HANDLE_HEIGHT,
  },
  scrollContentUnderHandle: {
    paddingTop: Spacing.md + SHEET_HANDLE_HEIGHT,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  topSection: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  coverShadow: {
    marginBottom: Spacing.md,
    // Shadow strength: tweak the 0.5 alpha (iOS) / elevation 8 (Android)
    shadowColor: 'rgba(40, 20, 8, 0.5)',
    shadowOffset: { width: 0, height: 26 },
    shadowOpacity: 1,
    shadowRadius: 40,
    elevation: 8,
  },
  coverShell: {
    borderTopLeftRadius: 6,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 6,
    overflow: 'hidden',
  },
  coverImage: {
    width: 150,
    height: 224,
  },
  spineEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 9,
  },
  coverLoadingText: {
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
  },
  thumbnailPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderInitial: {
    fontSize: Typography.sizes.xxxl,
    fontFamily: getSerifFontFamily('medium'),
  },
  bookTitle: {
    fontSize: 24,
    fontFamily: getSerifFontFamily('medium'),
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  bookAuthor: {
    fontSize: Typography.sizes.lg,
    ...serifItalicStyle,
    textAlign: 'center',
  },
  sectionCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  ratingText: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('medium'),
  },
  reviewLabel: {
    fontSize: Typography.sizes.xs,
    fontFamily: getFontFamily('semibold'),
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  reviewText: {
    fontSize: 15.5,
    lineHeight: 23,
    color: '#3a322b',
    ...serifItalicStyle,
  },
  metadata: {
    flexDirection: 'row',
    gap: Spacing.xl,
    borderTopWidth: 1,
    paddingTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  metadataItem: {
    gap: 2,
  },
  metadataLabel: {
    fontSize: Typography.sizes.xs,
    fontFamily: getFontFamily('medium'),
    letterSpacing: 0.4,
  },
  metadataValue: {
    fontSize: Typography.sizes.md,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.sm,
  },
  editButtonWrap: {
    flex: 1,
  },
  editBookButton: {
    borderRadius: 14,
    shadowColor: '#4a2f19',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 5,
  },
  deleteButton: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
  },
  input: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    fontSize: Typography.sizes.md,
    borderWidth: 1,
  },
  textArea: {
    minHeight: 80,
  },
  spineManagerCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  spineManagerHeader: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  currentSpinePreview: {
    width: 54,
    height: 140,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  currentSpineImage: {
    width: '100%',
    height: '100%',
  },
  spineManagerActions: {
    flex: 1,
  },
  spineManagerActionButton: {
    width: '100%',
  },
  spineManagerHelpText: {
    fontSize: Typography.sizes.xs,
    lineHeight: 18,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  spineStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  spineStatusText: {
    fontSize: Typography.sizes.sm,
  },
  spineOptionsRow: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  spineOptionButton: {
    width: 88,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.xs,
    gap: Spacing.xs,
  },
  spineOptionImage: {
    width: '100%',
    height: 144,
    borderRadius: BorderRadius.sm,
  },
  spineOptionImageFrame: {
    overflow: 'hidden',
  },
  spineOptionImageInner: {
    width: '100%',
    height: '100%',
  },
  spineOptionPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  spineOptionTitle: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    textAlign: 'center',
  },
  spineOptionAuthor: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 6,
  },
  spineOptionLabel: {
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
  },
  spineEmptyText: {
    fontSize: Typography.sizes.sm,
    lineHeight: 20,
  },
  editButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  editButton: {
    flex: 1,
  },
});

export default BookDetailModal;
