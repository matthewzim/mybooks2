/**
 * CommunityBookItem Component
 *
 * Displays a community book spine that users can add to their shelves.
 * Shows book details and an "Add to Shelf" button.
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Spacing, BorderRadius, Shadows, Typography, Animations, getFontFamily } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { CommunityBookSpine } from '@/types';

interface CommunityBookItemProps {
  book: CommunityBookSpine;
  onAddToShelf: (book: CommunityBookSpine) => Promise<void>;
}

export function CommunityBookItem({ book, onAddToShelf }: CommunityBookItemProps) {
  const { colors } = useTheme();
  const [isAdding, setIsAdding] = useState(false);
  const [isAdded, setIsAdded] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateScale = (toValue: number) => {
    Animated.timing(scale, {
      toValue,
      duration: Animations.fast,
      useNativeDriver: true,
    }).start();
  };

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
    <Animated.View style={{ transform: [{ scale }] }}>
      <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: book.image_url }}
            style={styles.image}
            contentFit="cover"
            transition={220}
          />
        </View>

        <View style={styles.detailsContainer}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {book.title}
          </Text>
          <Text style={[styles.author, { color: colors.textSecondary }]} numberOfLines={1}>
            by {book.author}
          </Text>

          {book.uploader_name && (
            <Pressable
              style={({ pressed }) => [
                styles.uploaderContainer,
                { backgroundColor: pressed ? colors.backgroundDark : 'transparent' },
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
              <Ionicons name="person-circle-outline" size={16} color={colors.primary} />
              <Text style={[styles.uploaderText, { color: colors.textSecondary }]}>
                Uploaded by <Text style={[styles.uploaderName, { color: colors.primary }]}>{book.uploader_name}</Text>
              </Text>
              <Ionicons name="chevron-forward" size={12} color={colors.primary} />
            </Pressable>
          )}

          {book.times_added > 0 && (
            <View style={styles.badgeContainer}>
              <Ionicons name="people" size={12} color={colors.textSecondary} />
              <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                Added by {book.times_added} {book.times_added === 1 ? 'user' : 'users'}
              </Text>
            </View>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: isAdded ? colors.success : colors.primary },
            pressed && !isAdded && styles.addButtonPressed,
          ]}
          onPress={handleAddToShelf}
          onPressIn={() => animateScale(0.985)}
          onPressOut={() => animateScale(1)}
          disabled={isAdding || isAdded}
          accessibilityRole="button"
          accessibilityLabel={isAdded ? 'Added to shelf' : 'Add to shelf'}
        >
          {isAdding ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : isAdded ? (
            <>
              <Ionicons name="checkmark" size={20} color={colors.textInverse} />
              <Text style={[styles.addButtonText, { color: colors.textInverse }]}>Added</Text>
            </>
          ) : (
            <>
              <Ionicons name="add" size={20} color={colors.textInverse} />
              <Text style={[styles.addButtonText, { color: colors.textInverse }]}>Add</Text>
            </>
          )}
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    ...Shadows.sm,
  },
  imageContainer: {
    width: 48,
    height: 80,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
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
    fontFamily: getFontFamily('semibold'),
    marginBottom: Spacing.xxs,
  },
  author: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
    marginBottom: Spacing.xs,
  },
  uploaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
    marginTop: Spacing.xs,
    paddingVertical: Spacing.xxs,
    paddingHorizontal: Spacing.xxs,
    marginLeft: -Spacing.xxs,
    borderRadius: BorderRadius.sm,
  },
  uploaderText: {
    fontSize: Typography.sizes.xs,
    fontFamily: getFontFamily('regular'),
  },
  uploaderName: {
    fontFamily: getFontFamily('medium'),
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
    marginTop: Spacing.xs,
  },
  badgeText: {
    fontSize: Typography.sizes.xs,
    fontFamily: getFontFamily('regular'),
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    minWidth: 88,
    justifyContent: 'center',
  },
  addButtonPressed: {
    opacity: 0.88,
  },
  addButtonText: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('semibold'),
  },
});

export default CommunityBookItem;
