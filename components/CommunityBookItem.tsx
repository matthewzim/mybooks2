/**
 * CommunityBookItem Component
 *
 * Displays a community book spine that users can add to their shelves.
 * Shows book details and an "Add to Shelf" button.
 *
 * Features:
 * - Book spine image preview
 * - Title and author display
 * - Uploader info
 * - Add to shelf action
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  Colors,
  Spacing,
  BorderRadius,
  Shadows,
  Typography,
} from '@/constants/theme';
import type { CommunityBookSpine } from '@/types';

interface CommunityBookItemProps {
  book: CommunityBookSpine;
  onAddToShelf: (book: CommunityBookSpine) => Promise<void>;
}

export function CommunityBookItem({ book, onAddToShelf }: CommunityBookItemProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [isAdded, setIsAdded] = useState(false);

  const handleAddToShelf = async () => {
    if (isAdding || isAdded) return;

    setIsAdding(true);
    try {
      await onAddToShelf(book);
      setIsAdded(true);
    } catch (error) {
      console.error('Failed to add book:', error);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Book spine image */}
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: book.image_url }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
      </View>

      {/* Book details */}
      <View style={styles.detailsContainer}>
        <Text style={styles.title} numberOfLines={2}>
          {book.title}
        </Text>
        <Text style={styles.author} numberOfLines={1}>
          by {book.author}
        </Text>

        {book.uploader_name && (
          <Pressable
            style={({ pressed }) => [
              styles.uploaderContainer,
              pressed && styles.uploaderPressed,
            ]}
            onPress={() => {
              router.push({
                pathname: '/user/[id]',
                params: { id: book.uploaded_by_user_id },
              });
            }}
            accessibilityRole="link"
            accessibilityLabel={`View ${book.uploader_name}'s profile`}
          >
            <Ionicons
              name="person-circle-outline"
              size={14}
              color={Colors.primary}
            />
            <Text style={styles.uploaderText}>
              Uploaded by <Text style={styles.uploaderName}>{book.uploader_name}</Text>
            </Text>
            <Ionicons
              name="chevron-forward"
              size={12}
              color={Colors.primary}
            />
          </Pressable>
        )}

        {/* Times added badge */}
        {book.times_added > 0 && (
          <View style={styles.badgeContainer}>
            <Ionicons name="people" size={12} color={Colors.textSecondary} />
            <Text style={styles.badgeText}>
              Added by {book.times_added} {book.times_added === 1 ? 'user' : 'users'}
            </Text>
          </View>
        )}
      </View>

      {/* Add to shelf button */}
      <Pressable
        style={({ pressed }) => [
          styles.addButton,
          isAdded && styles.addedButton,
          pressed && !isAdded && styles.addButtonPressed,
        ]}
        onPress={handleAddToShelf}
        disabled={isAdding || isAdded}
        accessibilityRole="button"
        accessibilityLabel={isAdded ? 'Added to shelf' : 'Add to shelf'}
      >
        {isAdding ? (
          <ActivityIndicator size="small" color={Colors.textInverse} />
        ) : isAdded ? (
          <>
            <Ionicons name="checkmark" size={20} color={Colors.textInverse} />
            <Text style={styles.addButtonText}>Added</Text>
          </>
        ) : (
          <>
            <Ionicons name="add" size={20} color={Colors.textInverse} />
            <Text style={styles.addButtonText}>Add</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  imageContainer: {
    width: 50,
    height: 80,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.backgroundDark,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  detailsContainer: {
    flex: 1,
    marginLeft: Spacing.md,
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
    marginBottom: 2,
  },
  author: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  uploaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
    paddingVertical: 2,
    paddingHorizontal: 4,
    marginLeft: -4,
    borderRadius: BorderRadius.sm,
  },
  uploaderPressed: {
    backgroundColor: Colors.backgroundDark,
  },
  uploaderText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
  },
  uploaderName: {
    color: Colors.primary,
    fontWeight: Typography.weights.medium,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
  },
  badgeText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    minWidth: 80,
    justifyContent: 'center',
  },
  addButtonPressed: {
    opacity: 0.8,
  },
  addedButton: {
    backgroundColor: Colors.success,
  },
  addButtonText: {
    color: Colors.textInverse,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
});

export default CommunityBookItem;
