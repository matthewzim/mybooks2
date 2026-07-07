/**
 * ScanShelfPanel - Scan a real bookshelf during onboarding
 *
 * Inline panel for the Populate step: photograph (or upload a photo of) a
 * real bookshelf, OCR the spines, match them to real books, then add the
 * selected matches to the onboarding preview shelf. Books are only written
 * to Supabase when onboarding completes, so matches become PreviewBooks
 * here rather than shelf rows.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Spacing, BorderRadius, Typography, getFontFamily } from '@/constants/theme';
import { BookSpine as BookSpineConstants } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useOnboarding, type PreviewBook } from './OnboardingContext';
import { shelfScanService, type ShelfScanMatch } from '@/services/shelfScan';

type ScanPhase = 'pick' | 'detecting' | 'matching' | 'review';

function getBookColor(title?: string | null): string {
  const colors = BookSpineConstants.colors;
  const safeTitle = title?.trim() || 'Untitled';
  let hash = 0;
  for (let i = 0; i < safeTitle.length; i++) {
    hash = safeTitle.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function ScanShelfPanel({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const { addBooks } = useOnboarding();

  const [phase, setPhase] = useState<ScanPhase>('pick');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [matches, setMatches] = useState<ShelfScanMatch[]>([]);
  const [deselectedKeys, setDeselectedKeys] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const isBusy = phase === 'detecting' || phase === 'matching';

  const handlePhotoPicked = (asset: ImagePicker.ImagePickerAsset) => {
    if (!asset.base64) {
      setError('Could not read the selected photo. Please try again.');
      return;
    }
    setError(null);
    setPhotoUri(asset.uri);
    setPhotoBase64(asset.base64);
    setMatches([]);
    setDeselectedKeys(new Set());
    setPhase('pick');
  };

  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('Please enable camera access to photograph your bookshelf.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        handlePhotoPicked(result.assets[0]);
      }
    } catch {
      setError('Failed to take a photo. Please try again.');
    }
  };

  const handlePickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        handlePhotoPicked(result.assets[0]);
      }
    } catch {
      setError('Failed to pick a photo. Please try again.');
    }
  };

  const handleScan = useCallback(async () => {
    if (!photoBase64) return;

    if (!shelfScanService.isConfigured()) {
      setError('Shelf scanning needs text recognition, which is not configured on this build.');
      return;
    }

    setError(null);
    setPhase('detecting');
    try {
      const detectResult = await shelfScanService.detectSpineTexts(photoBase64);
      if (detectResult.error || !detectResult.data) {
        setError(detectResult.error?.message || 'Could not read the photo.');
        setPhase('pick');
        return;
      }

      const texts = detectResult.data;
      if (texts.length === 0) {
        setError('We could not read any book spines in this photo. Try a closer, well-lit shot taken straight on.');
        setPhase('pick');
        return;
      }

      setPhase('matching');
      setProgress({ processed: 0, total: texts.length });
      const found = await shelfScanService.matchSpineTexts(texts, (processed, total) =>
        setProgress({ processed, total })
      );

      if (found.length === 0) {
        setError('We read some text but could not match it to any books. Try a closer photo so the spine titles are sharper.');
        setPhase('pick');
        return;
      }

      setMatches(found);
      setDeselectedKeys(new Set());
      setPhase('review');
    } catch {
      setError('Something went wrong while scanning. Please try again.');
      setPhase('pick');
    }
  }, [photoBase64]);

  const toggleMatch = (key: string) => {
    setDeselectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectedMatches = matches.filter((match) => !deselectedKeys.has(match.key));

  const handleAddBooks = () => {
    if (selectedMatches.length === 0) return;

    const books: PreviewBook[] = selectedMatches.map((match) => ({
      id: `scan-${match.key}`,
      title: match.title,
      author: match.author,
      color: getBookColor(match.title),
      genre: 'fiction',
      rating: Math.floor(Math.random() * 2) + 4,
      image_url: match.resolvedSpineUrl || null,
      source_image_url: match.spineImagePath || null,
    }));

    addBooks(books);
    onClose();
  };

  const renderPickPhase = () => (
    <>
      {photoUri ? (
        <>
          <Image source={{ uri: photoUri }} style={styles.photoPreview} contentFit="cover" />
          <Pressable
            style={[styles.primaryButton, { backgroundColor: colors.accent }]}
            onPress={handleScan}
          >
            <Ionicons name="scan" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Scan for Books</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, { borderColor: colors.border }]}
            onPress={handlePickPhoto}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Choose a Different Photo
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Take a photo of a real bookshelf and we&apos;ll read the spines and match the
            books. Best results come from a straight-on, well-lit photo.
          </Text>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: colors.accent }]}
            onPress={handleTakePhoto}
          >
            <Ionicons name="camera" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Take Photo</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, { borderColor: colors.border }]}
            onPress={handlePickPhoto}
          >
            <Ionicons name="image-outline" size={18} color={colors.accent} />
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Upload Existing Photo
            </Text>
          </Pressable>
        </>
      )}
    </>
  );

  const renderBusyPhase = () => (
    <View style={styles.busyContainer}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={[styles.busyTitle, { color: colors.text }]}>
        {phase === 'detecting' ? 'Reading book spines…' : 'Matching books…'}
      </Text>
      {phase === 'matching' && progress.total > 0 && (
        <Text style={[styles.busySubtitle, { color: colors.textSecondary }]}>
          {progress.processed} of {progress.total}
        </Text>
      )}
    </View>
  );

  const renderReviewPhase = () => (
    <>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        We found {matches.length} {matches.length === 1 ? 'book' : 'books'}. Uncheck any you
        don&apos;t want to add.
      </Text>

      {matches.map((match) => {
        const isSelected = !deselectedKeys.has(match.key);
        const thumbnailUrl = match.resolvedSpineUrl || match.coverUrl;
        return (
          <Pressable
            key={match.key}
            style={[
              styles.matchRow,
              { borderColor: colors.borderLight },
              !isSelected && styles.matchRowDeselected,
            ]}
            onPress={() => toggleMatch(match.key)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
          >
            <Ionicons
              name={isSelected ? 'checkbox' : 'square-outline'}
              size={22}
              color={isSelected ? colors.accent : colors.textLight}
            />
            {thumbnailUrl ? (
              <View style={[styles.matchThumb, { backgroundColor: colors.backgroundDark }]}>
                <Image source={{ uri: thumbnailUrl }} style={styles.matchThumbImage} contentFit="contain" />
              </View>
            ) : (
              <View style={[styles.matchThumb, styles.matchThumbPlaceholder, { backgroundColor: getBookColor(match.title) }]}>
                <Text style={styles.matchThumbInitial}>
                  {match.title.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.matchInfo}>
              <Text style={[styles.matchTitle, { color: colors.text }]} numberOfLines={2}>
                {match.title}
              </Text>
              <Text style={[styles.matchAuthor, { color: colors.textSecondary }]} numberOfLines={1}>
                {match.author}
              </Text>
            </View>
          </Pressable>
        );
      })}

      <Pressable
        style={[
          styles.primaryButton,
          { backgroundColor: colors.accent, opacity: selectedMatches.length > 0 ? 1 : 0.5 },
        ]}
        onPress={handleAddBooks}
        disabled={selectedMatches.length === 0}
      >
        <Text style={styles.primaryButtonText}>
          Add {selectedMatches.length} {selectedMatches.length === 1 ? 'Book' : 'Books'}
        </Text>
      </Pressable>
      <Pressable
        style={[styles.secondaryButton, { borderColor: colors.border }]}
        onPress={() => setPhase('pick')}
      >
        <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
          Scan a Different Photo
        </Text>
      </Pressable>
    </>
  );

  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.panelHeader}>
        <Text style={[styles.panelTitle, { color: colors.text }]}>Scan Shelf</Text>
        <Pressable onPress={onClose} hitSlop={8} disabled={isBusy}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      {error && (
        <Text style={[styles.errorText, { color: colors.error || '#ef4444' }]}>{error}</Text>
      )}

      {phase === 'pick' && renderPickPhase()}
      {isBusy && renderBusyPhase()}
      {phase === 'review' && renderReviewPhase()}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  panelTitle: {
    fontSize: Typography.sizes.lg,
    fontFamily: getFontFamily('semibold'),
  },
  hint: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
    lineHeight: 20,
  },
  errorText: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: BorderRadius.md,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    minHeight: 44,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('semibold'),
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    minHeight: 44,
  },
  secondaryButtonText: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('medium'),
  },
  busyContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  busyTitle: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('semibold'),
    textAlign: 'center',
  },
  busySubtitle: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  matchRowDeselected: {
    opacity: 0.45,
  },
  matchThumb: {
    width: 32,
    height: 50,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  matchThumbImage: {
    width: '100%',
    height: '100%',
  },
  matchThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchThumbInitial: {
    color: '#fff',
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('semibold'),
  },
  matchInfo: {
    flex: 1,
    gap: 2,
  },
  matchTitle: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('medium'),
  },
  matchAuthor: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
  },
});
