/**
 * BookDetailModal Component
 *
 * A minimal modal for viewing and editing book details.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
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
import { Image } from 'expo-image';
import { booksService } from '@/services/books';
import { googleBooksService } from '@/services/googleBooks';
import { getCoverImageUrl } from '@/services/storage';
import { Button, Rating } from '@/components/ui';
import {
  BorderRadius,
  Spacing,
  Typography,
  BookSpine as BookSpineConstants,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { Book } from '@/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.9, 420);
const CARD_MAX_HEIGHT = Math.min(SCREEN_HEIGHT * 0.85, 680);

interface BookDetailModalProps {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
  onBookUpdated?: (book: Book) => void;
  onBookDeleted?: (bookId: string) => void;
}

function getBookColor(title: string): string {
  const colors = BookSpineConstants.colors;
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function BookDetailModal({
  visible,
  book,
  onClose,
  onBookUpdated,
  onBookDeleted,
}: BookDetailModalProps) {
  const { colors } = useTheme();

  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [review, setReview] = useState('');
  const [rating, setRating] = useState(0);

  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [isCoverLoading, setIsCoverLoading] = useState(false);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(24)).current;
  const cardScale = useRef(new Animated.Value(0.98)).current;

  useEffect(() => {
    if (book) {
      setTitle(book.title);
      setAuthor(book.author);
      setReview(book.review || '');
      setRating(book.rating || 0);
      setIsEditing(false);
      setCoverImageUrl(book.cover_image_url || null);
    }
  }, [book]);

  // Fetch cover image from Google Books when the modal opens
  useEffect(() => {
    if (!visible || !book) return;

    let cancelled = false;

    // Already have a cached cover — resolve its URL (handles signed URLs for private buckets)
    if (book.cover_image_url) {
      getCoverImageUrl(book.cover_image_url).then((resolved) => {
        if (!cancelled) setCoverImageUrl(resolved);
      });
      return;
    }

    setIsCoverLoading(true);

    googleBooksService
      .fetchAndCacheCover({
        book_id: book.book_id,
        title: book.title,
        author: book.author,
      })
      .then(async (result) => {
        if (cancelled) return;
        if (result.data) {
          const resolved = await getCoverImageUrl(result.data);
          if (!cancelled) setCoverImageUrl(resolved);
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

  if (!book) return null;

  const bookColor = getBookColor(book.title);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity, backgroundColor: colors.overlay }]}>
        <Pressable style={styles.backdropPress} onPress={handleClose} accessible={false} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none" style={styles.keyboardView}>
          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.inputBorder,
                opacity: cardOpacity,
                transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
              },
            ]}
          >
            <View style={[styles.headerRow, { borderBottomColor: colors.inputBorder }]}>
              <Text style={[styles.pageTitle, { color: colors.text }]}>{isEditing ? 'Edit Book' : 'Book Details'}</Text>
              <View style={styles.headerButtons}>
                {!isEditing && (
                  <Pressable onPress={handleDelete} style={styles.iconButton} hitSlop={8}>
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </Pressable>
                )}
                <Pressable onPress={handleClose} style={styles.iconButton} hitSlop={8}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </Pressable>
              </View>
            </View>

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

                  <View style={styles.editButtons}>
                    <Button title="Cancel" variant="outline" onPress={handleCancel} style={styles.editButton} />
                    <Button title="Save" onPress={handleSave} loading={isSaving} style={styles.editButton} />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.topSection}>
                    <View style={[styles.coverShell, { backgroundColor: colors.bookBase }]}>
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
                      ) : book.image_url ? (
                        <Image source={{ uri: book.image_url }} style={styles.coverImage} contentFit="cover" />
                      ) : (
                        <View style={[styles.coverImage, styles.thumbnailPlaceholder, { backgroundColor: bookColor }]}>
                          <Text style={[styles.placeholderInitial, { color: colors.textOnDark }]}>
                            {book.title.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.bookTitle, { color: colors.text }]}>{book.title}</Text>
                    <Text style={[styles.bookAuthor, { color: colors.textSecondary }]}>by {book.author}</Text>
                  </View>

                  <View style={[styles.sectionCard, { backgroundColor: colors.cardDark }]}>
                    <Rating value={book.rating || 0} readonly size={20} />
                    <Text style={[styles.ratingText, { color: colors.textSecondary }]}>
                      {book.rating ? 'Your rating' : 'Not rated yet'}
                    </Text>
                  </View>

                  <View style={[styles.sectionCard, { backgroundColor: colors.bookBase }]}>
                    <Text style={[styles.reviewLabel, { color: colors.textSecondary }]}>Review</Text>
                    {book.review ? (
                      <Text style={[styles.reviewText, { color: colors.text }]}>{book.review}</Text>
                    ) : (
                      <Text style={[styles.reviewText, { color: colors.textSecondary }]}>No review yet.</Text>
                    )}
                  </View>

                  <View style={[styles.metadata, { borderTopColor: colors.inputBorder }]}>
                    {book.isbn && (
                      <Text style={[styles.metadataText, { color: colors.textSecondary }]}>ISBN: {book.isbn}</Text>
                    )}
                    <Text style={[styles.metadataText, { color: colors.textSecondary }]}>
                      Added: {new Date(book.created_at).toLocaleDateString()}
                    </Text>
                  </View>

                  <Button title="Edit Book" variant="outline" onPress={() => setIsEditing(true)} fullWidth />
                </>
              )}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  keyboardView: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  card: {
    width: CARD_WIDTH,
    maxHeight: CARD_MAX_HEIGHT,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
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
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconButton: {
    padding: Spacing.xs,
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  topSection: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  coverShell: {
    padding: Spacing.xs,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  coverImage: {
    width: 128,
    height: 192,
    borderRadius: BorderRadius.sm,
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
    fontWeight: Typography.weights.bold,
  },
  bookTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  bookAuthor: {
    fontSize: Typography.sizes.md,
    textAlign: 'center',
  },
  sectionCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  ratingText: {
    fontSize: Typography.sizes.sm,
  },
  reviewLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  reviewText: {
    fontSize: Typography.sizes.md,
    lineHeight: 20,
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
