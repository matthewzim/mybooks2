/**
 * Book Detail Screen
 *
 * Displays full book details with ability to edit.
 * Features:
 * - Book title and author
 * - Spine image
 * - User review and rating
 * - Edit and delete actions
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { booksService } from '@/services/books';
import { Button, Rating, LoadingView, EmptyState } from '@/components/ui';
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  Shadows,
} from '@/constants/theme';
import type { Book } from '@/types';

export default function BookDetailScreen() {
  const { id, shelfId } = useLocalSearchParams<{ id: string; shelfId: string }>();
  const [book, setBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Edit form state
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [review, setReview] = useState('');
  const [rating, setRating] = useState(0);

  /**
   * Fetch book data
   */
  useEffect(() => {
    async function loadBook() {
      if (!id) return;

      setIsLoading(true);
      try {
        const result = await booksService.getBookById(id);
        if (result.data) {
          setBook(result.data);
          setTitle(result.data.title);
          setAuthor(result.data.author);
          setReview(result.data.review || '');
          setRating(result.data.rating || 0);
        }
      } catch (error) {
        console.error('Failed to load book:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadBook();
  }, [id]);

  /**
   * Save changes
   */
  const handleSave = async () => {
    if (!book || !id) return;

    if (!title.trim()) {
      Alert.alert('Error', 'Title is required');
      return;
    }

    setIsSaving(true);
    try {
      const result = await booksService.updateBook(id, {
        title: title.trim(),
        author: author.trim(),
        review: review.trim() || null,
        rating: rating || null,
      });

      if (result.data) {
        setBook(result.data);
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
            if (!id) return;

            try {
              const result = await booksService.deleteBook(id);
              if (!result.error) {
                router.back();
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

  // Loading state
  if (isLoading) {
    return <LoadingView message="Loading book details..." />;
  }

  // Error state
  if (!book) {
    return (
      <SafeAreaView style={styles.container}>
        <EmptyState
          icon="book-outline"
          title="Book Not Found"
          description="This book may have been deleted."
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: isEditing ? 'Edit Book' : 'Book Details',
          headerRight: () =>
            !isEditing && (
              <Pressable
                onPress={handleDelete}
                style={styles.headerButton}
                hitSlop={8}
              >
                <Ionicons name="trash-outline" size={20} color={Colors.textInverse} />
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
            {/* Book Spine Image */}
            <View style={styles.imageSection}>
              {book.image_url ? (
                <Image
                  source={{ uri: book.image_url }}
                  style={styles.bookImage}
                  contentFit="contain"
                />
              ) : (
                <View style={[styles.bookImage, styles.bookPlaceholder]}>
                  <Ionicons
                    name="book-outline"
                    size={64}
                    color={Colors.textLight}
                  />
                </View>
              )}
            </View>

            {/* Book Details */}
            <View style={styles.detailsSection}>
              {isEditing ? (
                // Edit mode
                <>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Title</Text>
                    <TextInput
                      style={styles.input}
                      value={title}
                      onChangeText={setTitle}
                      placeholder="Book title"
                      placeholderTextColor={Colors.textLight}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Author</Text>
                    <TextInput
                      style={styles.input}
                      value={author}
                      onChangeText={setAuthor}
                      placeholder="Author name"
                      placeholderTextColor={Colors.textLight}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Your Rating</Text>
                    <Rating value={rating} onChange={setRating} size={32} />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Your Review</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={review}
                      onChangeText={setReview}
                      placeholder="Write your thoughts about this book..."
                      placeholderTextColor={Colors.textLight}
                      multiline
                      numberOfLines={5}
                      textAlignVertical="top"
                    />
                  </View>

                  {/* Edit Action Buttons */}
                  <View style={styles.editButtons}>
                    <Button
                      title="Cancel"
                      variant="outline"
                      onPress={handleCancel}
                      style={styles.editButton}
                    />
                    <Button
                      title="Save Changes"
                      onPress={handleSave}
                      loading={isSaving}
                      style={styles.editButton}
                    />
                  </View>
                </>
              ) : (
                // View mode
                <>
                  <Text style={styles.title}>{book.title}</Text>
                  <Text style={styles.author}>by {book.author}</Text>

                  {/* Rating */}
                  {book.rating && (
                    <View style={styles.ratingContainer}>
                      <Rating value={book.rating} readonly size={24} />
                      <Text style={styles.ratingText}>Your rating</Text>
                    </View>
                  )}

                  {/* Review */}
                  {book.review ? (
                    <View style={styles.reviewContainer}>
                      <Text style={styles.reviewLabel}>Your Review</Text>
                      <Text style={styles.reviewText}>{book.review}</Text>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.addReviewButton}
                      onPress={() => setIsEditing(true)}
                    >
                      <Ionicons
                        name="create-outline"
                        size={20}
                        color={Colors.primary}
                      />
                      <Text style={styles.addReviewText}>Add a review</Text>
                    </Pressable>
                  )}

                  {/* Metadata */}
                  <View style={styles.metadata}>
                    {book.isbn && (
                      <Text style={styles.metadataText}>ISBN: {book.isbn}</Text>
                    )}
                    <Text style={styles.metadataText}>
                      Added: {new Date(book.created_at).toLocaleDateString()}
                    </Text>
                  </View>

                  {/* Edit Button */}
                  <Button
                    title="Edit Book"
                    variant="outline"
                    onPress={() => setIsEditing(true)}
                    fullWidth
                    style={styles.editMainButton}
                  />
                </>
              )}
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
  imageSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.backgroundDark,
  },
  bookImage: {
    width: 120,
    height: 200,
    borderRadius: BorderRadius.md,
    ...Shadows.lg,
  },
  bookPlaceholder: {
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsSection: {
    padding: Spacing.lg,
  },
  title: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  author: {
    fontSize: Typography.sizes.lg,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  ratingText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },
  reviewContainer: {
    backgroundColor: Colors.backgroundDark,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  reviewLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  reviewText: {
    fontSize: Typography.sizes.md,
    color: Colors.text,
    lineHeight: 22,
  },
  addReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundDark,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  addReviewText: {
    fontSize: Typography.sizes.md,
    color: Colors.primary,
  },
  metadata: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  metadataText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  editMainButton: {
    marginTop: Spacing.md,
  },
  field: {
    marginBottom: Spacing.lg,
  },
  fieldLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.backgroundDark,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.sizes.md,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: {
    minHeight: 120,
  },
  editButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  editButton: {
    flex: 1,
  },
});
