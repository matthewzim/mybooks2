/**
 * BookDetailModal Component
 *
 * A minimal modal for viewing and editing book details.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
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
import { googleBooksService } from '@/services/googleBooks';
import { getCoverImageUrl, storageService } from '@/services/storage';
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
import type { Book, CommunityBookSpine } from '@/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = Math.min(SCREEN_HEIGHT * 0.88, 720);

interface BookDetailModalProps {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
  onBookUpdated?: (book: Book) => void;
  onBookDeleted?: (bookId: string) => void;
  readOnly?: boolean;
}

const getBookColor = getClothColor;

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
        <Image source={{ uri: resolvedImageUrl }} style={styles.spineOptionImage} contentFit="cover" />
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

const GRID_COLUMNS = 3;
const GRID_SPACING = Spacing.sm;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - Spacing.md * 2 - GRID_SPACING * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

function CommunitySpineBrowserModal({
  visible,
  book,
  isUpdatingSpine,
  onSelect,
  onClose,
}: {
  visible: boolean;
  book: Book | null;
  isUpdatingSpine: boolean;
  onSelect: (option: CommunityBookSpine) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [spines, setSpines] = useState<CommunityBookSpine[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!visible || !book) {
      setSpines([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    booksService
      .getAlternativeSpines(book)
      .then((result) => {
        if (!cancelled) setSpines(result.data || []);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, book]);

  const handleSelect = useCallback(
    (option: CommunityBookSpine) => {
      Alert.alert(
        'Use This Spine?',
        `Replace your current spine with this one${option.uploader_name ? ` uploaded by ${option.uploader_name}` : ''}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Use This Spine',
            onPress: () => onSelect(option),
          },
        ]
      );
    },
    [onSelect]
  );

  const renderItem = useCallback(
    ({ item }: { item: CommunityBookSpine }) => (
      <CommunitySpineGridItem
        option={item}
        isUpdating={isUpdatingSpine}
        onSelect={handleSelect}
      />
    ),
    [isUpdatingSpine, handleSelect]
  );

  const keyExtractor = useCallback((item: CommunityBookSpine) => item.id, []);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[communityStyles.container, { backgroundColor: colors.background }]}>
        <View style={[communityStyles.header, { borderBottomColor: colors.inputBorder }]}>
          <Text style={[communityStyles.headerTitle, { color: colors.text }]}>Community Spines</Text>
          <Pressable onPress={onClose} style={communityStyles.closeButton} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <Text style={[communityStyles.subtitle, { color: colors.textSecondary }]}>
          {book ? `Spine images uploaded by the community for "${book.title}"` : ''}
        </Text>

        {isLoading ? (
          <View style={communityStyles.centerContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[communityStyles.loadingText, { color: colors.textSecondary }]}>
              Loading community spines...
            </Text>
          </View>
        ) : spines.length === 0 ? (
          <View style={communityStyles.centerContent}>
            <Ionicons name="images-outline" size={48} color={colors.textLight} />
            <Text style={[communityStyles.emptyTitle, { color: colors.text }]}>No Community Spines</Text>
            <Text style={[communityStyles.emptyText, { color: colors.textSecondary }]}>
              No one has uploaded an alternative spine image for this book yet. Be the first by scanning or uploading one!
            </Text>
          </View>
        ) : (
          <FlatList
            data={spines}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            numColumns={GRID_COLUMNS}
            columnWrapperStyle={communityStyles.gridRow}
            contentContainerStyle={communityStyles.gridContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </Modal>
  );
}

function CommunitySpineGridItem({
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
        communityStyles.gridItem,
        {
          width: GRID_ITEM_WIDTH,
          borderColor: colors.inputBorder,
          backgroundColor: colors.card,
        },
      ]}
      onPress={() => onSelect(option)}
      disabled={isUpdating}
    >
      {resolvedImageUrl ? (
        <Image
          source={{ uri: resolvedImageUrl }}
          style={communityStyles.gridItemImage}
          contentFit="cover"
        />
      ) : (
        <View style={[communityStyles.gridItemImage, communityStyles.gridItemPlaceholder, { backgroundColor }]}>
          <Text style={[styles.spineOptionTitle, { color: colors.textOnDark }]} numberOfLines={3}>
            {option.title}
          </Text>
          <Text style={[styles.spineOptionAuthor, { color: colors.textOnDarkMuted }]} numberOfLines={2}>
            {option.author}
          </Text>
        </View>
      )}
      <Text style={[communityStyles.gridItemLabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {option.uploader_name ? `By ${option.uploader_name}` : 'Community'}
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
  const [isClosing, setIsClosing] = useState(false);
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
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(24)).current;
  const cardScale = useRef(new Animated.Value(0.98)).current;
  const coverUrlCacheRef = useRef<Record<string, string>>({});
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
  // before calling Google Books again.
  useEffect(() => {
    if (!visible || !book) return;

    let cancelled = false;

    const cachedCoverForBook = coverUrlCacheRef.current[book.book_id];
    if (cachedCoverForBook) {
      setCoverImageUrl(cachedCoverForBook);
      return;
    }

    // Already have a cached cover — resolve its URL (handles signed URLs for private buckets)
    if (book.cover_image_url) {
      getCoverImageUrl(book.cover_image_url).then((resolved) => {
        if (!cancelled && resolved) {
          coverUrlCacheRef.current[book.book_id] = resolved;
          setCoverImageUrl(resolved);
        }
      });
      return;
    }

    setIsCoverLoading(true);

    googleBooksService
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
          // If the returned URL is a direct external URL (e.g. Google Books),
          // use it directly instead of running through Supabase URL resolution.
          const isExternalUrl =
            result.data.startsWith('https://books.google.com') ||
            result.data.startsWith('https://encrypted-tbn');
          const resolved = isExternalUrl
            ? result.data
            : await getCoverImageUrl(result.data);
          if (!cancelled && resolved) {
            coverUrlCacheRef.current[book.book_id] = resolved;
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

  useEffect(() => {
    if (visible && book) {
      setIsClosing(false);
      overlayOpacity.setValue(0);
      cardOpacity.setValue(0);
      cardTranslateY.setValue(24);
      cardScale.setValue(0.98);

      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(cardTranslateY, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, book, overlayOpacity, cardOpacity, cardTranslateY, cardScale]);

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

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 0,
        duration: 140,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: 16,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardScale, {
        toValue: 0.98,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsClosing(false);
      onClose();
    });
  };

  const handleSave = async () => {
    if (!book) return;

    if (!title.trim()) {
      Alert.alert('Error', 'Title is required');
      return;
    }

    setIsSaving(true);
    try {
      const result = await booksService.updateBook(book.id, {
        title: title.trim(),
        author: author.trim(),
        review: review.trim() || null,
        rating: rating || null,
      });

      if (result.data) {
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
      const result = await booksService.updateBook(book.id, {
        image_url: option.image_url,
      });

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
                opacity: cardOpacity,
                transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
              },
            ]}
          >
            <View style={styles.grabber} />

            {isEditing ? (
              <View style={[styles.headerRow, { borderBottomColor: colors.borderLight }]}>
                <Text style={[styles.pageTitle, { color: colors.text }]}>Edit Book</Text>
                <Pressable onPress={handleClose} style={styles.iconButton} hitSlop={8}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={handleClose} style={styles.floatingClose} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            )}

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
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
                      <Text style={[styles.metadataText, { color: colors.textSecondary }]}>ISBN: {book.isbn}</Text>
                    )}
                    <Text style={[styles.metadataText, { color: colors.textSecondary }]}>
                      Added: {new Date(book.created_at).toLocaleDateString()}
                    </Text>
                  </View>

                  {!readOnly && (
                    <View style={styles.actionsRow}>
                      <Button
                        title="Edit book"
                        onPress={() => setIsEditing(true)}
                        style={{
                          ...styles.editBookButton,
                          backgroundColor: colors.primary,
                          borderColor: colors.primary,
                        }}
                        textStyle={{ color: colors.textInverse }}
                        colors={colors}
                      />
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
  grabber: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#d8ccb6',
    alignSelf: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  floatingClose: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    zIndex: 2,
    padding: Spacing.xs,
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
  iconButton: {
    padding: Spacing.xs,
  },
  scrollView: {
    flexGrow: 0,
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
    shadowColor: 'rgba(40, 20, 8, 0.7)',
    shadowOffset: { width: 0, height: 26 },
    shadowOpacity: 1,
    shadowRadius: 40,
    elevation: 12,
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
    borderTopWidth: 1,
    paddingTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  metadataText: {
    fontSize: Typography.sizes.xs,
    marginBottom: Spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.sm,
  },
  editBookButton: {
    flex: 1,
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

const communityStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.sizes.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    lineHeight: 20,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: Typography.sizes.sm,
    marginTop: Spacing.sm,
  },
  emptyTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  emptyText: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  gridContent: {
    padding: Spacing.md,
  },
  gridRow: {
    gap: GRID_SPACING,
    marginBottom: GRID_SPACING,
  },
  gridItem: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.xs,
    gap: Spacing.xs,
  },
  gridItemImage: {
    width: '100%',
    aspectRatio: 1 / 2.5,
    borderRadius: BorderRadius.sm,
  },
  gridItemPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  gridItemLabel: {
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
  },
});

export default BookDetailModal;
