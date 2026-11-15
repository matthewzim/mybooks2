/**
 * SpinePicker Component
 *
 * A horizontal row of the spines a book can use — real spine photos first,
 * then the book's AI-generated spine — standing side by side like books on a
 * shelf. The spine in use is ringed and ticked; tapping another applies it.
 *
 * Used in the BookDetailModal edit view and in SpinePickerModal.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
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
import { getSpineImageRef } from '@/utils/placeholderSpine';
import type { Book, SpineOption } from '@/types';

/** Every spine stands this tall; its width follows from the image. */
const SPINE_HEIGHT = 176;
const SPINE_MIN_WIDTH = 26;
const SPINE_MAX_WIDTH = 124;
/** Width used until the image has loaded and reported its real proportions. */
const SPINE_FALLBACK_WIDTH = 40;
const RING_WIDTH = 2;
const RING_GAP = 3;
const CHECK_SIZE = 22;

export interface SpinePickerAction {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

interface SpinePickerProps {
  book: Book | null;
  /** Called with the refreshed book after a spine is applied. */
  onBookUpdated?: (book: Book) => void;
  /** Icon buttons shown beside the title (e.g. scan, upload). */
  actions?: SpinePickerAction[];
  /** Something else (a scan or upload) is changing the spine right now. */
  busy?: boolean;
}

function SpinePickerItem({
  option,
  index,
  bookTitle,
  isSelected,
  isSaving,
  disabled,
  onSelect,
}: {
  option: SpineOption;
  index: number;
  bookTitle: string;
  isSelected: boolean;
  isSaving: boolean;
  disabled: boolean;
  onSelect: (option: SpineOption) => void;
}) {
  const { colors } = useTheme();
  const resolvedImageUrl = useSpineImageUrl(option.image_url);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  const width = aspectRatio
    ? Math.round(Math.max(SPINE_MIN_WIDTH, Math.min(SPINE_MAX_WIDTH, SPINE_HEIGHT * aspectRatio)))
    : SPINE_FALLBACK_WIDTH;

  return (
    <Pressable
      onPress={() => onSelect(option)}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={`Spine option ${index + 1}`}
      accessibilityState={{ selected: isSelected, disabled, busy: isSaving }}
      style={({ pressed }) => [
        styles.item,
        { borderColor: isSelected ? colors.primary : 'transparent' },
        pressed && styles.itemPressed,
      ]}
    >
      <View
        style={[
          styles.spine,
          { width, backgroundColor: getClothColor(bookTitle) },
          disabled && !isSelected && !isSaving && styles.spineDimmed,
        ]}
      >
        {resolvedImageUrl ? (
          <Image
            source={{ uri: resolvedImageUrl }}
            style={styles.spineImage}
            // The box already carries the image's own proportions; `cover`
            // only absorbs rounding (or the width clamp on an odd crop).
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            onLoad={(event) => {
              const { width: w, height: h } = event.source;
              if (w > 0 && h > 0) setAspectRatio(w / h);
            }}
          />
        ) : null}
        {isSaving && (
          <View style={[styles.savingOverlay, { backgroundColor: colors.overlay }]}>
            <ActivityIndicator size="small" color="#ffffff" />
          </View>
        )}
      </View>
      {isSelected && (
        <View style={[styles.check, { backgroundColor: colors.primary, borderColor: colors.card }]}>
          <Ionicons name="checkmark" size={14} color="#ffffff" />
        </View>
      )}
    </Pressable>
  );
}

export function SpinePicker({ book, onBookUpdated, actions, busy = false }: SpinePickerProps) {
  const { colors } = useTheme();
  const [options, setOptions] = useState<SpineOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const bookRef = useRef(book);
  bookRef.current = book;

  // Keyed on what the options depend on, not on the book object: applying a
  // spine hands back a new book, and refetching then would blank the row and
  // reshuffle it under the user's finger.
  const itemId = book?.id;
  const title = book?.title;
  const author = book?.author;
  const isbn = book?.isbn;
  const aiSpineUrl = book?.ai_spine_url;

  useEffect(() => {
    const current = bookRef.current;
    if (!current) {
      setOptions([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    booksService
      .getSpineOptions(current)
      .then((result) => {
        if (!cancelled) setOptions(result.data || []);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [itemId, title, author, isbn, aiSpineUrl]);

  // A photo the user has just scanned or uploaded isn't among the fetched
  // options yet; show it first so the spine in use is always in the row.
  const currentPhoto = book?.image_url ?? null;
  const displayOptions = useMemo(() => {
    if (!currentPhoto || options.some((o) => o.kind === 'community' && o.image_url === currentPhoto)) {
      return options;
    }
    const own: SpineOption = { key: `current:${currentPhoto}`, kind: 'community', image_url: currentPhoto };
    return [own, ...options];
  }, [options, currentPhoto]);

  const selectedRef = getSpineImageRef(book);

  const handleSelect = useCallback(
    async (option: SpineOption) => {
      const current = bookRef.current;
      if (!current || option.image_url === getSpineImageRef(current)) return;

      setSavingKey(option.key);
      try {
        const result = await booksService.selectSpine(current.id, option);
        if (result.data) {
          onBookUpdated?.(result.data);
        } else {
          Alert.alert('Error', result.error?.message || 'Failed to update the book spine.');
        }
      } catch {
        Alert.alert('Error', 'Failed to update the book spine.');
      } finally {
        setSavingKey(null);
      }
    },
    [onBookUpdated]
  );

  const isBusy = busy || savingKey !== null;
  const hasActions = !!actions && actions.length > 0;

  return (
    <View>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]}>Spine</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Select a spine to display for this book
          </Text>
        </View>
        {hasActions && (
          <View style={styles.actions}>
            {busy && <ActivityIndicator size="small" color={colors.primary} />}
            {actions!.map((action) => (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                disabled={isBusy}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                style={({ pressed }) => [
                  styles.actionButton,
                  { borderColor: colors.inputBorder, backgroundColor: colors.card },
                  (pressed || isBusy) && styles.actionButtonMuted,
                ]}
              >
                <Ionicons name={action.icon} size={20} color={colors.text} />
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
        {isLoading ? (
          <View style={styles.status}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : displayOptions.length === 0 ? (
          <View style={styles.status}>
            <Ionicons name="images-outline" size={28} color={colors.textLight} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {hasActions
                ? 'No spines for this book yet. Scan or upload one to add it.'
                : 'No spines are available for this book yet.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
          >
            {displayOptions.map((option, index) => (
              <SpinePickerItem
                key={option.key}
                option={option}
                index={index}
                bookTitle={book?.title ?? ''}
                isSelected={option.image_url === selectedRef}
                isSaving={savingKey === option.key}
                disabled={isBusy}
                onSelect={handleSelect}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  subtitle: {
    fontSize: Typography.sizes.sm,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonMuted: {
    opacity: 0.5,
  },
  card: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  status: {
    height: SPINE_HEIGHT + Spacing.md * 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  emptyText: {
    fontSize: Typography.sizes.sm,
    lineHeight: 18,
    textAlign: 'center',
  },
  row: {
    // Bottom-aligned so the spines share a baseline, like books on a shelf.
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    // Room for the check badge, which sits on the ring's top corner.
    paddingTop: Spacing.md + CHECK_SIZE / 2,
  },
  item: {
    borderWidth: RING_WIDTH,
    borderRadius: BorderRadius.sm + RING_GAP,
    padding: RING_GAP,
  },
  itemPressed: {
    opacity: 0.85,
  },
  spine: {
    height: SPINE_HEIGHT,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  spineDimmed: {
    opacity: 0.6,
  },
  spineImage: {
    width: '100%',
    height: '100%',
  },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    position: 'absolute',
    top: -CHECK_SIZE / 2,
    right: -CHECK_SIZE / 2,
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default SpinePicker;
