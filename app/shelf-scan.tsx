/**
 * Shelf Scan Screen
 *
 * Add many books at once from a photo of a real bookshelf:
 * 1. Take a photo of a bookshelf (or upload an existing one)
 * 2. OCR reads the title/author text off the spines
 * 3. Each spine is matched to a real book via the ISBNdb API
 * 4. Review the matches, then add them all to the shelf — books with
 *    community spine images get them, the rest get placeholder spines
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { shelfScanService, type ShelfScanMatch } from '@/services/shelfScan';
import { Button } from '@/components/ui';
import { Spacing, BorderRadius, Typography, getFontFamily, getSerifFontFamily } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { getClothColor } from '@/utils/spineCloth';

type ScanPhase = 'pick' | 'detecting' | 'matching' | 'review' | 'adding';

export default function ShelfScanScreen() {
  const { shelfId } = useLocalSearchParams<{ shelfId: string }>();
  const { colors } = useTheme();

  const [phase, setPhase] = useState<ScanPhase>('pick');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [matches, setMatches] = useState<ShelfScanMatch[]>([]);
  const [deselectedKeys, setDeselectedKeys] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ processed: 0, total: 0 });

  const isBusy = phase === 'detecting' || phase === 'matching' || phase === 'adding';

  const handlePhotoPicked = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!asset.base64) {
      Alert.alert('Error', 'Could not read the selected photo. Please try again.');
      return;
    }
    setPhotoUri(asset.uri);
    // Downscale before OCR so large photos don't get rejected with an HTTP 400;
    // fall back to the raw base64 if manipulation fails for any reason.
    const prepared = await shelfScanService.prepareImageForOcr(
      asset.uri,
      asset.width,
      asset.height
    );
    setPhotoBase64(prepared ?? asset.base64);
    setMatches([]);
    setDeselectedKeys(new Set());
    setPhase('pick');
  };

  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera Required', 'Please enable camera access to photograph your bookshelf.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        await handlePhotoPicked(result.assets[0]);
      }
    } catch {
      Alert.alert('Error', 'Failed to take a photo. Please try again.');
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
        await handlePhotoPicked(result.assets[0]);
      }
    } catch {
      Alert.alert('Error', 'Failed to pick a photo. Please try again.');
    }
  };

  const handleScan = async () => {
    if (!photoBase64) return;

    if (!shelfScanService.isConfigured()) {
      Alert.alert(
        'Not Available',
        'Shelf scanning needs text recognition, which is not configured on this build.'
      );
      return;
    }

    setPhase('detecting');
    try {
      const detectResult = await shelfScanService.detectSpineTexts(photoBase64);
      if (detectResult.error || !detectResult.data) {
        Alert.alert('Scan Failed', detectResult.error?.message || 'Could not read the photo.');
        setPhase('pick');
        return;
      }

      const texts = detectResult.data;
      if (texts.length === 0) {
        Alert.alert(
          'No Text Found',
          'We could not read any book spines in this photo. Try a closer, well-lit shot taken straight on.'
        );
        setPhase('pick');
        return;
      }

      setPhase('matching');
      setProgress({ processed: 0, total: texts.length });
      const found = await shelfScanService.matchSpineTexts(texts, (processed, total) =>
        setProgress({ processed, total })
      );

      if (found.length === 0) {
        Alert.alert(
          'No Books Matched',
          'We read some text but could not match it to any books. Try a closer photo so the spine titles are sharper.'
        );
        setPhase('pick');
        return;
      }

      setMatches(found);
      setDeselectedKeys(new Set());
      setPhase('review');
    } catch {
      Alert.alert('Scan Failed', 'Something went wrong while scanning. Please try again.');
      setPhase('pick');
    }
  };

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

  const handleAddBooks = async () => {
    if (!shelfId) {
      Alert.alert('Error', 'No bookshelf selected');
      return;
    }
    if (selectedMatches.length === 0) return;

    setPhase('adding');
    setProgress({ processed: 0, total: selectedMatches.length });

    try {
      const result = await shelfScanService.addMatchesToShelf(
        selectedMatches,
        shelfId,
        (processed, total) => setProgress({ processed, total })
      );

      const placeholderNote =
        result.placeholders > 0
          ? `\n${result.placeholders} ${result.placeholders === 1 ? 'book uses' : 'books use'} a placeholder spine until a spine photo is added.`
          : '';

      Alert.alert(
        'Success!',
        `We found ${result.added} ${result.added === 1 ? 'book' : 'books'}.${placeholderNote}`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch {
      Alert.alert('Error', 'Failed to add books to your shelf. Please try again.');
      setPhase('review');
    }
  };

  const renderPickPhase = () => (
    <View style={styles.pickContainer}>
      {photoUri ? (
        <>
          <Image source={{ uri: photoUri }} style={styles.photoPreview} contentFit="cover" />
          <View style={styles.pickActions}>
            <Button title="Scan for Books" onPress={handleScan} fullWidth size="lg" colors={colors} />
            <Button
              title="Choose a Different Photo"
              variant="outline"
              onPress={handlePickPhoto}
              fullWidth
              colors={colors}
            />
          </View>
        </>
      ) : (
        <>
          <View style={[styles.heroIcon, { backgroundColor: colors.backgroundDark }]}>
            <Ionicons name="library-outline" size={44} color={colors.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Scan your bookshelf</Text>
          <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
            Take a photo of a real bookshelf and we&apos;ll read the spines, match the books, and
            add them to this shelf. Best results come from a straight-on, well-lit photo.
          </Text>

          <View style={styles.pickActions}>
            <Button title="Take Photo" onPress={handleTakePhoto} fullWidth size="lg" colors={colors} />
            <Button
              title="Upload Existing Photo"
              variant="outline"
              onPress={handlePickPhoto}
              fullWidth
              size="lg"
              colors={colors}
            />
          </View>
        </>
      )}
    </View>
  );

  const renderBusyPhase = () => (
    <View style={styles.busyContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.busyTitle, { color: colors.text }]}>
        {phase === 'detecting' && 'Reading book spines…'}
        {phase === 'matching' && 'Matching books…'}
        {phase === 'adding' && 'Adding books to your shelf…'}
      </Text>
      {(phase === 'matching' || phase === 'adding') && progress.total > 0 && (
        <Text style={[styles.busySubtitle, { color: colors.textSecondary }]}>
          {progress.processed} of {progress.total}
        </Text>
      )}
    </View>
  );

  const renderReviewPhase = () => (
    <>
      <View style={[styles.reviewHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="checkmark-circle" size={20} color={colors.success} />
        <Text style={[styles.reviewHeaderText, { color: colors.text }]}>
          We found {matches.length} {matches.length === 1 ? 'book' : 'books'}. Uncheck any you
          don&apos;t want to add.
        </Text>
      </View>

      <ScrollView style={styles.reviewList} contentContainerStyle={styles.reviewListContent}>
        {matches.map((match) => {
          const isSelected = !deselectedKeys.has(match.key);
          const thumbnailUrl = match.resolvedSpineUrl || match.coverUrl;
          return (
            <Pressable
              key={match.key}
              style={[
                styles.matchRow,
                { backgroundColor: colors.card, borderColor: colors.border },
                !isSelected && styles.matchRowDeselected,
              ]}
              onPress={() => toggleMatch(match.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
            >
              <Ionicons
                name={isSelected ? 'checkbox' : 'square-outline'}
                size={22}
                color={isSelected ? colors.primary : colors.textLight}
              />
              {thumbnailUrl ? (
                <View style={[styles.matchThumbFrame, { backgroundColor: colors.backgroundDark }]}>
                  <Image source={{ uri: thumbnailUrl }} style={styles.matchThumb} contentFit="contain" />
                </View>
              ) : (
                <View
                  style={[
                    styles.matchThumbFrame,
                    styles.matchThumbPlaceholder,
                    { backgroundColor: getClothColor(match.title) },
                  ]}
                >
                  <Text style={[styles.matchThumbInitial, { color: colors.textOnDark }]}>
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
                <View style={styles.matchBadge}>
                  <Ionicons
                    name={match.spineImagePath ? 'image' : 'color-palette-outline'}
                    size={12}
                    color={colors.textSecondary}
                  />
                  <Text style={[styles.matchBadgeText, { color: colors.textSecondary }]}>
                    {match.spineImagePath ? 'Community spine available' : 'Placeholder spine'}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.reviewFooter, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Button
          title={`Add ${selectedMatches.length} ${selectedMatches.length === 1 ? 'Book' : 'Books'} to Shelf`}
          onPress={handleAddBooks}
          disabled={selectedMatches.length === 0}
          fullWidth
          size="lg"
          colors={colors}
        />
        <Button
          title="Scan a Different Photo"
          variant="outline"
          onPress={() => setPhase('pick')}
          fullWidth
          colors={colors}
        />
      </View>
    </>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={styles.headerButton}
              disabled={isBusy}
            >
              <Text style={[styles.headerButtonText, { color: colors.textInverse }]}>Cancel</Text>
            </Pressable>
          ),
        }}
      />

      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['left', 'right', 'bottom']}
      >
        {phase === 'pick' && renderPickPhase()}
        {isBusy && renderBusyPhase()}
        {phase === 'review' && renderReviewPhase()}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButton: {
    padding: Spacing.xs,
  },
  headerButtonText: {
    fontSize: Typography.sizes.md,
  },
  pickContainer: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  heroIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
  },
  heroTitle: {
    fontSize: 24,
    fontFamily: getSerifFontFamily('medium'),
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('regular'),
    textAlign: 'center',
    lineHeight: 22,
  },
  photoPreview: {
    width: '100%',
    flex: 1,
    borderRadius: BorderRadius.lg,
  },
  pickActions: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  busyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  busyTitle: {
    fontSize: Typography.sizes.lg,
    fontFamily: getFontFamily('semibold'),
    textAlign: 'center',
  },
  busySubtitle: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('regular'),
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
  },
  reviewHeaderText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('medium'),
    lineHeight: 20,
  },
  reviewList: {
    flex: 1,
  },
  reviewListContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
  },
  matchRowDeselected: {
    opacity: 0.45,
  },
  matchThumbFrame: {
    width: 40,
    height: 64,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  matchThumb: {
    width: '100%',
    height: '100%',
  },
  matchThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchThumbInitial: {
    fontSize: Typography.sizes.lg,
    fontFamily: getSerifFontFamily('medium'),
  },
  matchInfo: {
    flex: 1,
    gap: 2,
  },
  matchTitle: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('semibold'),
  },
  matchAuthor: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  matchBadgeText: {
    fontSize: Typography.sizes.xs,
    fontFamily: getFontFamily('regular'),
  },
  reviewFooter: {
    padding: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
  },
});
