/**
 * BookDetailModal Component
 *
 * A modal that displays book details with a book-opening animation.
 * The modal looks like an open book with the book cover opening
 * to reveal the content inside.
 *
 * Features:
 * - Book opening/closing animation
 * - View and edit modes
 * - Rating and review functionality
 * - Delete book option
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  Animated,
  Dimensions,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { booksService } from '@/services/books';
import { Button, Rating, LoadingView } from '@/components/ui';
import {
  Spacing,
  BorderRadius,
  Typography,
  Shadows,
  BookSpine as BookSpineConstants,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { Book } from '@/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BOOK_WIDTH = Math.min(SCREEN_WIDTH * 0.85, 360);
const BOOK_HEIGHT = Math.min(SCREEN_HEIGHT * 0.75, 580);

interface BookDetailModalProps {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
  onBookUpdated?: (book: Book) => void;
  onBookDeleted?: (bookId: string) => void;
}

/**
 * Get a consistent color for a book based on its title
 */
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

  // Edit form state
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [review, setReview] = useState('');
  const [rating, setRating] = useState(0);

  // Animation values
  const bookOpenAnimation = useRef(new Animated.Value(0)).current;
  const fadeAnimation = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  // Initialize form when book changes
  useEffect(() => {
    if (book) {
      setTitle(book.title);
      setAuthor(book.author);
      setReview(book.review || '');
      setRating(book.rating || 0);
      setIsEditing(false);
    }
  }, [book]);

  // Handle opening animation
  useEffect(() => {
    if (visible && book) {
      setIsClosing(false);
      // Start with closed book, then animate opening
      bookOpenAnimation.setValue(0);
      fadeAnimation.setValue(0);
      contentOpacity.setValue(0);

      // Fade in backdrop
      Animated.timing(fadeAnimation, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      // Animate book opening after a small delay
      setTimeout(() => {
        Animated.timing(bookOpenAnimation, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();

        // Fade in content after book opens
        setTimeout(() => {
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }).start();
        }, 400);
      }, 100);
    }
  }, [visible, book]);

  /**
   * Handle closing with animation
   */
  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);

    // Fade out content first
    Animated.timing(contentOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start();

    // Close the book
    Animated.timing(bookOpenAnimation, {
      toValue: 0,
      duration: 400,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // Fade out backdrop and close modal
    setTimeout(() => {
      Animated.timing(fadeAnimation, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setIsClosing(false);
        onClose();
      });
    }, 300);
  };

  /**
   * Save changes
   */
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
    } catch (error) {
      Alert.alert('Error', 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Cancel editing
   */
  const handleCancel = () => {
    if (book) {
      setTitle(book.title);
      setAuthor(book.author);
      setReview(book.review || '');
      setRating(book.rating || 0);
    }
    setIsEditing(false);
  };

  /**
   * Delete book
   */
  const handleDelete = () => {
    Alert.alert(
      'Delete Book',
      'Are you sure you want to remove this book from your shelf?',
      [
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
            } catch (error) {
              Alert.alert('Error', 'Failed to delete book');
            }
          },
        },
      ]
    );
  };

  if (!book) return null;

  const bookColor = getBookColor(book.title);

  // Book cover rotation interpolation (opens from right to left like a real book cover)
  const coverRotation = bookOpenAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-160deg'],
  });

  // Book cover translation to simulate 3D perspective
  const coverTranslateX = bookOpenAnimation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -BOOK_WIDTH * 0.3, -BOOK_WIDTH * 0.5],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnimation, backgroundColor: colors.overlay }]}>
        <Pressable style={styles.backdropPress} onPress={handleClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <View style={styles.bookContainer}>
            {/* Book Base (back cover and pages) */}
            <View style={[styles.bookBase, { backgroundColor: colors.bookBase }]}>
              {/* Page texture lines */}
              <View style={styles.pageLines}>
                {[...Array(20)].map((_, i) => (
                  <View key={i} style={[styles.pageLine, { backgroundColor: colors.bookPageLines }]} />
                ))}
              </View>

              {/* Right page content */}
              <Animated.View style={[styles.pageContent, { opacity: contentOpacity, backgroundColor: colors.bookPageContent }]}>
                <ScrollView
                  style={styles.scrollView}
                  contentContainerStyle={styles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {/* Close button */}
                  <View style={[styles.headerRow, { borderBottomColor: colors.inputBorder }]}>
                    <Text style={[styles.pageTitle, { color: colors.text }]}>
                      {isEditing ? 'Edit Book' : 'Book Details'}
                    </Text>
                    <View style={styles.headerButtons}>
                      {!isEditing && (
                        <Pressable
                          onPress={handleDelete}
                          style={styles.iconButton}
                          hitSlop={8}
                        >
                          <Ionicons name="trash-outline" size={20} color={colors.error} />
                        </Pressable>
                      )}
                      <Pressable
                        onPress={handleClose}
                        style={styles.iconButton}
                        hitSlop={8}
                      >
                        <Ionicons name="close" size={24} color={colors.text} />
                      </Pressable>
                    </View>
                  </View>

                  {isEditing ? (
                    // Edit mode
                    <>
                      <View style={styles.field}>
                        <Text style={[styles.fieldLabel, { color: colors.text }]}>Title</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                          value={title}
                          onChangeText={setTitle}
                          placeholder="Book title"
                          placeholderTextColor={colors.textLight}
                        />
                      </View>

                      <View style={styles.field}>
                        <Text style={[styles.fieldLabel, { color: colors.text }]}>Author</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
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
                          style={[styles.input, styles.textArea, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
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
                        <Button
                          title="Cancel"
                          variant="outline"
                          onPress={handleCancel}
                          style={styles.editButton}
                        />
                        <Button
                          title="Save"
                          onPress={handleSave}
                          loading={isSaving}
                          style={styles.editButton}
                        />
                      </View>
                    </>
                  ) : (
                    // View mode
                    <>
                      {/* Book cover thumbnail */}
                      <View style={styles.thumbnailContainer}>
                        {book.image_url ? (
                          <Image
                            source={{ uri: book.image_url }}
                            style={styles.thumbnail}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={[styles.thumbnail, styles.thumbnailPlaceholder, { backgroundColor: bookColor }]}>
                            <Ionicons name="book" size={32} color={colors.textInverse} />
                          </View>
                        )}
                      </View>

                      <Text style={[styles.bookTitle, { color: colors.text }]}>{book.title}</Text>
                      <Text style={[styles.bookAuthor, { color: colors.textSecondary }]}>by {book.author}</Text>

                      {/* Rating */}
                      <View style={[styles.ratingContainer, { backgroundColor: colors.cardDark }]}>
                        <Rating value={book.rating || 0} readonly size={22} />
                        {book.rating ? (
                          <Text style={[styles.ratingText, { color: colors.textSecondary }]}>Your rating</Text>
                        ) : (
                          <Text style={[styles.ratingText, { color: colors.textSecondary }]}>Not rated</Text>
                        )}
                      </View>

                      {/* Review */}
                      {book.review ? (
                        <View style={[styles.reviewContainer, { backgroundColor: colors.bookBase, borderLeftColor: colors.primary }]}>
                          <Text style={[styles.reviewLabel, { color: colors.textSecondary }]}>Your Review</Text>
                          <Text style={[styles.reviewText, { color: colors.text }]}>{book.review}</Text>
                        </View>
                      ) : (
                        <Pressable
                          style={[styles.addReviewButton, { backgroundColor: colors.bookBase, borderColor: colors.inputBorder }]}
                          onPress={() => setIsEditing(true)}
                        >
                          <Ionicons name="create-outline" size={18} color={colors.primary} />
                          <Text style={[styles.addReviewText, { color: colors.primary }]}>Add a review</Text>
                        </Pressable>
                      )}

                      {/* Metadata */}
                      <View style={[styles.metadata, { borderTopColor: colors.inputBorder }]}>
                        {book.isbn && (
                          <Text style={[styles.metadataText, { color: colors.textSecondary }]}>ISBN: {book.isbn}</Text>
                        )}
                        <Text style={[styles.metadataText, { color: colors.textSecondary }]}>
                          Added: {new Date(book.created_at).toLocaleDateString()}
                        </Text>
                      </View>

                      {/* Edit Button */}
                      <Button
                        title="Edit Book"
                        variant="outline"
                        onPress={() => setIsEditing(true)}
                        fullWidth
                      />
                    </>
                  )}
                </ScrollView>
              </Animated.View>

              {/* Book spine (center binding) */}
              <View style={[styles.bookSpine, { backgroundColor: colors.bookshelfWood }]} />
            </View>

            {/* Book Cover (animated) */}
            <Animated.View
              style={[
                styles.bookCover,
                {
                  backgroundColor: bookColor,
                  transform: [
                    { perspective: 1000 },
                    { translateX: coverTranslateX },
                    { rotateY: coverRotation },
                  ],
                },
              ]}
            >
              {/* Cover content */}
              <View style={styles.coverContent}>
                {book.image_url ? (
                  <Image
                    source={{ uri: book.image_url }}
                    style={styles.coverImage}
                    contentFit="cover"
                  />
                ) : (
                  <>
                    <View style={styles.coverDecoration}>
                      <View style={[styles.coverLine, { backgroundColor: colors.textOnDarkMuted }]} />
                      <View style={[styles.coverLine, styles.coverLineShort, { backgroundColor: colors.textOnDarkMuted }]} />
                    </View>
                    <Text style={[styles.coverTitle, { color: colors.textOnDark }]} numberOfLines={4}>
                      {book.title}
                    </Text>
                    <Text style={[styles.coverAuthor, { color: colors.textOnDarkMuted }]} numberOfLines={2}>
                      {book.author}
                    </Text>
                    <View style={styles.coverDecoration}>
                      <View style={[styles.coverLine, styles.coverLineShort, { backgroundColor: colors.textOnDarkMuted }]} />
                      <View style={[styles.coverLine, { backgroundColor: colors.textOnDarkMuted }]} />
                    </View>
                  </>
                )}
              </View>

              {/* Cover spine edge */}
              <View style={[styles.coverSpineEdge, { backgroundColor: colors.bookCoverEdge }]} />
            </Animated.View>
          </View>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookContainer: {
    width: BOOK_WIDTH,
    height: BOOK_HEIGHT,
    position: 'relative',
  },
  // Book base (pages and back cover)
  bookBase: {
    position: 'absolute',
    width: BOOK_WIDTH,
    height: BOOK_HEIGHT,
    borderRadius: BorderRadius.sm,
    ...Shadows.lg,
    overflow: 'hidden',
  },
  pageLines: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 15,
    justifyContent: 'space-evenly',
    paddingLeft: 2,
  },
  pageLine: {
    height: 1,
    marginLeft: 2,
  },
  pageContent: {
    flex: 1,
    marginLeft: 15,
    borderTopRightRadius: BorderRadius.sm,
    borderBottomRightRadius: BorderRadius.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  bookSpine: {
    position: 'absolute',
    left: 12,
    top: 0,
    bottom: 0,
    width: 4,
    ...Shadows.sm,
  },
  // Book cover (animated)
  bookCover: {
    position: 'absolute',
    width: BOOK_WIDTH,
    height: BOOK_HEIGHT,
    borderRadius: BorderRadius.sm,
    transformOrigin: 'left center',
    ...Shadows.lg,
    backfaceVisibility: 'hidden',
  },
  coverContent: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    borderRadius: BorderRadius.sm,
  },
  coverDecoration: {
    alignItems: 'center',
    marginVertical: Spacing.md,
  },
  coverLine: {
    width: 80,
    height: 2,
    marginVertical: 4,
  },
  coverLineShort: {
    width: 50,
  },
  coverTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
    marginVertical: Spacing.md,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  coverAuthor: {
    fontSize: Typography.sizes.md,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  coverSpineEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 8,
    borderTopLeftRadius: BorderRadius.sm,
    borderBottomLeftRadius: BorderRadius.sm,
  },
  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderBottomWidth: 1,
    paddingBottom: Spacing.sm,
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
  // Thumbnail
  thumbnailContainer: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  thumbnail: {
    width: 80,
    height: 120,
    borderRadius: BorderRadius.sm,
    ...Shadows.md,
  },
  thumbnailPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Book info
  bookTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  bookAuthor: {
    fontSize: Typography.sizes.md,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  // Rating
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  ratingText: {
    fontSize: Typography.sizes.sm,
  },
  // Review
  reviewContainer: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 3,
  },
  reviewLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reviewText: {
    fontSize: Typography.sizes.md,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  addReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addReviewText: {
    fontSize: Typography.sizes.sm,
  },
  // Metadata
  metadata: {
    borderTopWidth: 1,
    paddingTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  metadataText: {
    fontSize: Typography.sizes.xs,
    marginBottom: Spacing.xs,
  },
  // Edit mode
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
