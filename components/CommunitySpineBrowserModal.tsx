/**
 * CommunitySpineBrowserModal Component
 *
 * Full-screen sheet listing community-uploaded spine images for a book.
 * Spines are rendered to scale (contained, never cropped/zoomed) so users
 * can see what the actual spine looks like before choosing it.
 *
 * Used from the BookDetailModal edit view and from the Browse Community
 * add-book flow after a book is added with a placeholder spine.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { booksService } from '@/services/books';
import { useSpineImageUrl } from '@/hooks/useSpineImageUrl';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { getClothColor } from '@/utils/spineCloth';
import type { Book, CommunityBookSpine } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const GRID_COLUMNS = 3;
const GRID_SPACING = Spacing.sm;
const GRID_ITEM_WIDTH =
  (SCREEN_WIDTH - Spacing.md * 2 - GRID_SPACING * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

interface CommunitySpineBrowserModalProps {
  visible: boolean;
  book: Book | null;
  isUpdatingSpine: boolean;
  onSelect: (option: CommunityBookSpine) => void;
  onClose: () => void;
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
  const backgroundColor = getClothColor(option.title);

  return (
    <Pressable
      style={[
        styles.gridItem,
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
        // "contain" keeps the spine at its true aspect ratio instead of a
        // blown-up crop, so the whole spine photo is visible to scale.
        <View style={[styles.gridItemImageFrame, { backgroundColor: colors.backgroundDark }]}>
          <Image
            source={{ uri: resolvedImageUrl }}
            style={styles.gridItemImage}
            contentFit="contain"
          />
        </View>
      ) : (
        <View style={[styles.gridItemImageFrame, styles.gridItemPlaceholder, { backgroundColor }]}>
          <Text style={[styles.placeholderTitle, { color: colors.textOnDark }]} numberOfLines={3}>
            {option.title}
          </Text>
          <Text style={[styles.placeholderAuthor, { color: colors.textOnDarkMuted }]} numberOfLines={2}>
            {option.author}
          </Text>
        </View>
      )}
      <Text style={[styles.gridItemLabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {option.uploader_name ? `By ${option.uploader_name}` : 'Community'}
      </Text>
    </Pressable>
  );
}

export function CommunitySpineBrowserModal({
  visible,
  book,
  isUpdatingSpine,
  onSelect,
  onClose,
}: CommunitySpineBrowserModalProps) {
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
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.inputBorder }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Community Spines</Text>
          <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {book ? `Spine images uploaded by the community for "${book.title}"` : ''}
        </Text>

        {isLoading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Loading community spines...
            </Text>
          </View>
        ) : spines.length === 0 ? (
          <View style={styles.centerContent}>
            <Ionicons name="images-outline" size={48} color={colors.textLight} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Community Spines</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No one has uploaded an alternative spine image for this book yet. Be the first by scanning or uploading one!
            </Text>
          </View>
        ) : (
          <FlatList
            data={spines}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            numColumns={GRID_COLUMNS}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  gridItemImageFrame: {
    width: '100%',
    aspectRatio: 1 / 2.5,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  gridItemImage: {
    width: '100%',
    height: '100%',
  },
  gridItemPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  placeholderTitle: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    textAlign: 'center',
  },
  placeholderAuthor: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 6,
  },
  gridItemLabel: {
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
  },
});

export default CommunitySpineBrowserModal;
