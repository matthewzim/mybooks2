/**
 * Settings Screen
 *
 * User account settings and app configuration.
 * Features:
 * - Profile management
 * - Premium subscription
 * - Theme selection
 * - App settings
 * - Sign out
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Switch,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Input, Button } from '@/components/ui';
import {
  Spacing,
  BorderRadius,
  Typography,
  Shadows,
  ThemeType,
  ThemeColors,
} from '@/constants/theme';
import { FREE_TIER_LIMITS } from '@/services/stripe';
import { bookshelvesService } from '@/services/bookshelves';
import { booksService } from '@/services/books';
import { supabase } from '@/services/supabase';
import type { Bookshelf } from '@/types';

/**
 * Theme option configuration
 */
const THEME_OPTIONS: { value: ThemeType; label: string; icon: keyof typeof Ionicons.glyphMap; description: string }[] = [
  { value: 'light', label: 'Light Mode', icon: 'sunny-outline', description: 'Clean white background' },
  { value: 'dark', label: 'Dark Mode', icon: 'moon-outline', description: 'Easy on the eyes' },
  { value: 'standard', label: 'Standard', icon: 'leaf-outline', description: 'Warm brown tones' },
];

interface GoodreadsCsvBook {
  title: string;
  author: string;
}

const GOODREADS_TITLE_COLUMN_INDEX = 1;
const GOODREADS_AUTHOR_COLUMN_INDEX = 2;

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }
      currentRow.push(currentCell);
      const hasAnyCell = currentRow.some((cell) => cell.trim().length > 0);
      if (hasAnyCell) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => cell.trim().length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

function parseGoodreadsBooks(csvText: string): GoodreadsCsvBook[] {
  const rows = parseCsvRows(csvText);
  return rows
    .slice(1)
    .map((row) => ({
      title: row[GOODREADS_TITLE_COLUMN_INDEX]?.trim() || '',
      author: row[GOODREADS_AUTHOR_COLUMN_INDEX]?.trim() || '',
    }))
    .filter((book) => book.title.length > 0 && book.author.length > 0);
}

export default function SettingsScreen() {
  const { user, updateProfile } = useAuth();
  const { theme, setTheme, colors } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [isLoading, setIsLoading] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [showGoodreadsImportModal, setShowGoodreadsImportModal] = useState(false);
  const [isImportingGoodreads, setIsImportingGoodreads] = useState(false);

  const promptShelfSelection = async (): Promise<Bookshelf | 'create' | null> => {
    const result = await bookshelvesService.getUserBookshelves();
    if (result.error) {
      Alert.alert('Import Error', result.error.message);
      return null;
    }

    const shelves = result.data || [];

    return new Promise((resolve) => {
      Alert.alert(
        'Import Destination',
        'Add to existing bookshelf? or Create new bookshelf',
        [
          {
            text: 'Add to existing bookshelf',
            onPress: () => {
              if (shelves.length === 0) {
                Alert.alert(
                  'No bookshelves found',
                  'You do not have any bookshelves yet. We will create a new bookshelf for this import.'
                );
                resolve('create');
                return;
              }

              Alert.alert(
                'Choose Bookshelf',
                'Select an existing bookshelf for imported books.',
                [
                  ...shelves.map((shelf) => ({
                    text: shelf.name,
                    onPress: () => resolve(shelf),
                  })),
                  { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
                ]
              );
            },
          },
          { text: 'Create new bookshelf', onPress: () => resolve('create') },
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        ]
      );
    });
  };

  const ensureDestinationShelf = async (): Promise<Bookshelf | null> => {
    const selection = await promptShelfSelection();
    if (!selection) {
      return null;
    }

    if (selection !== 'create') {
      return selection;
    }

    const created = await bookshelvesService.createBookshelf({
      name: `Goodreads Import ${new Date().toLocaleDateString()}`,
      description: 'Imported from Goodreads CSV',
      is_public: false,
    });

    if (created.error || !created.data) {
      Alert.alert('Import Error', created.error?.message || 'Failed to create bookshelf');
      return null;
    }

    return created.data;
  };

  const handleGoodreadsImport = async () => {
    const destinationShelf = await ensureDestinationShelf();
    if (!destinationShelf) {
      return;
    }

    try {
      setIsImportingGoodreads(true);

      const picked = await DocumentPicker.getDocumentAsync({
        type: 'text/csv',
        copyToCacheDirectory: true,
      });

      if (picked.canceled || !picked.assets?.[0]?.uri) {
        return;
      }

      const csvContent = await FileSystem.readAsStringAsync(picked.assets[0].uri);
      const csvBooks = parseGoodreadsBooks(csvContent);

      if (csvBooks.length === 0) {
        Alert.alert('Import Error', 'No valid books found in CSV.');
        return;
      }

      const uniquePairs = Array.from(
        new Map(csvBooks.map((book) => [`${book.title.toLowerCase()}::${book.author.toLowerCase()}`, book])).values()
      );

      let importedCount = 0;
      let missingCount = 0;

      for (const csvBook of uniquePairs) {
        const { data: matchedBook, error: matchError } = await supabase
          .from('books')
          .select('id,title,author')
          .eq('title', csvBook.title)
          .eq('author', csvBook.author)
          .limit(1)
          .maybeSingle();

        if (matchError) {
          console.error('Book match query failed:', matchError);
          continue;
        }

        if (!matchedBook) {
          missingCount += 1;
          continue;
        }

        const createResult = await booksService.createBook({
          title: matchedBook.title,
          author: matchedBook.author,
          shelf_id: destinationShelf.id,
          book_id: matchedBook.id,
        });

        if (!createResult.error) {
          importedCount += 1;
        }
      }

      setShowGoodreadsImportModal(false);
      Alert.alert(
        'Goodreads Import Complete',
        `Added ${importedCount} book${importedCount === 1 ? '' : 's'} to "${destinationShelf.name}".${missingCount > 0 ? `\n${missingCount} book${missingCount === 1 ? '' : 's'} did not match books in our catalog.` : ''}`
      );
    } catch (error) {
      console.error('Goodreads import failed:', error);
      Alert.alert('Import Error', 'Failed to import Goodreads CSV. Please try again.');
    } finally {
      setIsImportingGoodreads(false);
    }
  };

  /**
   * Handle profile save
   */
  const handleSaveProfile = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }

    setIsLoading(true);
    try {
      const result = await updateProfile({ name: name.trim() });
      if (result.error) {
        Alert.alert('Error', result.error.message);
      } else {
        setIsEditing(false);
        Alert.alert('Success', 'Profile updated successfully');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Navigate to premium/payment screen
   */
  const handleUpgrade = () => {
    router.push('/payment');
  };

  /**
   * Handle theme change
   */
  const handleThemeChange = async (newTheme: ThemeType) => {
    await setTheme(newTheme);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.backgroundDark }]} edges={['left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Profile</Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {/* Avatar */}
            <View style={styles.avatarContainer}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={[styles.avatarText, { color: colors.textInverse }]}>
                  {(user?.name || 'U')[0].toUpperCase()}
                </Text>
              </View>
              {user?.is_premium && (
                <View style={[styles.premiumBadge, { backgroundColor: colors.primary, borderColor: colors.card }]}>
                  <Ionicons name="star" size={12} color={colors.starFilled} />
                </View>
              )}
            </View>

            {/* Profile Info */}
            {isEditing ? (
              <View style={styles.editForm}>
                <Input
                  label="Name"
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your name"
                  colors={colors}
                />
                <View style={styles.editButtons}>
                  <Button
                    title="Cancel"
                    variant="outline"
                    onPress={() => {
                      setName(user?.name || '');
                      setIsEditing(false);
                    }}
                    size="sm"
                    colors={colors}
                  />
                  <Button
                    title="Save"
                    onPress={handleSaveProfile}
                    loading={isLoading}
                    size="sm"
                    colors={colors}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.profileInfo}>
                <Text style={[styles.userName, { color: colors.text }]}>{user?.name || 'No name set'}</Text>
                <Pressable
                  style={styles.editButton}
                  onPress={() => setIsEditing(true)}
                >
                  <Ionicons name="pencil" size={16} color={colors.primary} />
                  <Text style={[styles.editButtonText, { color: colors.primary }]}>Edit Profile</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Premium Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Subscription</Text>
          <Pressable
            style={[styles.card, styles.premiumCard, { backgroundColor: colors.card }]}
            onPress={handleUpgrade}
          >
            <View style={styles.premiumContent}>
              <View style={styles.premiumHeader}>
                <Ionicons
                  name={user?.is_premium ? 'star' : 'star-outline'}
                  size={28}
                  color={user?.is_premium ? colors.starFilled : colors.primary}
                />
                <View style={styles.premiumText}>
                  <Text style={[styles.premiumTitle, { color: colors.text }]}>
                    {user?.is_premium ? 'Premium Member' : 'Go Premium'}
                  </Text>
                  <Text style={[styles.premiumDescription, { color: colors.textSecondary }]}>
                    {user?.is_premium
                      ? 'Thank you for your support!'
                      : 'Unlock unlimited bookshelves and home screen widget'}
                  </Text>
                </View>
              </View>
              {!user?.is_premium && (
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.textSecondary}
                />
              )}
            </View>
          </Pressable>
        </View>

        {/* Appearance Section - Theme Selection */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Appearance</Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {THEME_OPTIONS.map((option, index) => (
              <Pressable
                key={option.value}
                style={({ pressed }) => [
                  styles.themeOption,
                  { borderBottomColor: colors.border },
                  index === THEME_OPTIONS.length - 1 && styles.lastThemeOption,
                  pressed && { backgroundColor: colors.backgroundDark },
                ]}
                onPress={() => handleThemeChange(option.value)}
              >
                <View style={styles.themeOptionLeft}>
                  <View style={[
                    styles.themeIconContainer,
                    { backgroundColor: theme === option.value ? colors.primary : colors.backgroundDark }
                  ]}>
                    <Ionicons
                      name={option.icon}
                      size={20}
                      color={theme === option.value ? colors.textInverse : colors.primary}
                    />
                  </View>
                  <View style={styles.themeOptionText}>
                    <Text style={[styles.themeOptionTitle, { color: colors.text }]}>{option.label}</Text>
                    <Text style={[styles.themeOptionDescription, { color: colors.textSecondary }]}>
                      {option.description}
                    </Text>
                  </View>
                </View>
                {theme === option.value && (
                  <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Preferences Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Preferences</Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <SettingsRow
              icon="notifications-outline"
              title="Push Notifications"
              subtitle="Receive updates about your library"
              colors={colors}
              trailing={
                <Switch
                  value={notifications}
                  onValueChange={setNotifications}
                  trackColor={{
                    false: colors.border,
                    true: colors.primary,
                  }}
                />
              }
            />
          </View>
        </View>

        {/* Widget Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>iOS Widget</Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <SettingsRow
              icon="apps-outline"
              title="Home Screen Widget"
              subtitle={
                user?.is_premium || FREE_TIER_LIMITS.CAN_USE_WIDGET
                  ? 'Display a bookshelf on your home screen'
                  : 'Premium feature - Upgrade to unlock'
              }
              colors={colors}
              onPress={() => {
                if (user?.is_premium || FREE_TIER_LIMITS.CAN_USE_WIDGET) {
                  Alert.alert(
                    'Widget Setup',
                    'To add the widget:\n\n1. Long press on your home screen\n2. Tap the + button\n3. Search for "Virtual Library"\n4. Select the widget size\n5. Choose a bookshelf to display'
                  );
                } else {
                  Alert.alert(
                    'Premium Feature',
                    'Home Screen Widget is a premium feature. Upgrade to Premium to display your bookshelf on your home screen.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Upgrade', onPress: () => router.push('/payment') },
                    ]
                  );
                }
              }}
              trailing={
                !(user?.is_premium || FREE_TIER_LIMITS.CAN_USE_WIDGET) ? (
                  <Ionicons name="lock-closed" size={18} color={colors.textSecondary} />
                ) : undefined
              }
            />
          </View>
        </View>

        {/* Import Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Import</Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <SettingsRow
              icon="cloud-upload-outline"
              title="Import from Goodreads"
              subtitle="Upload your Goodreads CSV export"
              colors={colors}
              onPress={() => setShowGoodreadsImportModal(true)}
            />
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>About</Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <SettingsRow
              icon="information-circle-outline"
              title="App Version"
              subtitle="1.0.0"
              colors={colors}
            />
            <SettingsRow
              icon="document-text-outline"
              title="Terms of Service"
              colors={colors}
              onPress={() => {}}
            />
            <SettingsRow
              icon="shield-outline"
              title="Privacy Policy"
              colors={colors}
              onPress={() => {}}
            />
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      <Modal
        visible={showGoodreadsImportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGoodreadsImportModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowGoodreadsImportModal(false)}
        >
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.card }]}
            onPress={() => {}}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>Import from Goodreads</Text>
            <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
              Import your books from Goodreads CSV export. How to export your library:{'\n\n'}
              (1) Go to Goodreads.com and log in {'\u2022'}{'\n'}
              (2) Click 'My Books' and then 'Import and export'{"\n"}
              (3) Click 'Export Library' to download CSV file{"\n"}
              (4) Tap the button below to select the file.
            </Text>

            <Button
              title={isImportingGoodreads ? 'Importing...' : 'Select CSV file'}
              onPress={handleGoodreadsImport}
              disabled={isImportingGoodreads}
              colors={colors}
            />
            {isImportingGoodreads && (
              <View style={styles.importingRow}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={[styles.importingText, { color: colors.textSecondary }]}>Import in progress...</Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * Settings Row Component
 */
interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  colors: ThemeColors;
}

function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
  trailing,
  colors,
}: SettingsRowProps) {
  const content = (
    <View style={styles.rowContainer}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={22} color={colors.primary} />
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
          {subtitle && <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
        </View>
      </View>
      {trailing ||
        (onPress && (
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors.textSecondary}
          />
        ))}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          { borderBottomColor: colors.border },
          pressed && { backgroundColor: colors.backgroundDark },
        ]}
        onPress={onPress}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.row, { borderBottomColor: colors.border }]}>{content}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.md,
  },
  section: {
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  card: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  avatarContainer: {
    alignItems: 'center',
    paddingTop: Spacing.lg,
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
  },
  premiumBadge: {
    position: 'absolute',
    bottom: 0,
    right: '35%',
    borderRadius: 12,
    padding: 4,
    borderWidth: 2,
  },
  profileInfo: {
    alignItems: 'center',
    padding: Spacing.lg,
  },
  userName: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.semibold,
    marginBottom: 4,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  editButtonText: {
    fontSize: Typography.sizes.md,
  },
  editForm: {
    padding: Spacing.lg,
  },
  editButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'flex-end',
  },
  premiumCard: {
    padding: Spacing.md,
  },
  premiumContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  premiumText: {
    flex: 1,
  },
  premiumTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  premiumDescription: {
    fontSize: Typography.sizes.sm,
    marginTop: 2,
  },
  // Theme selection styles
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastThemeOption: {
    borderBottomWidth: 0,
  },
  themeOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  themeIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeOptionText: {
    flex: 1,
  },
  themeOptionTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.medium,
  },
  themeOptionDescription: {
    fontSize: Typography.sizes.sm,
    marginTop: 2,
  },
  // Row styles
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: Typography.sizes.md,
  },
  rowSubtitle: {
    fontSize: Typography.sizes.sm,
    marginTop: 2,
  },
  bottomPadding: {
    height: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadows.md,
  },
  modalTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  modalBody: {
    fontSize: Typography.sizes.md,
    lineHeight: 22,
  },
  importingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  importingText: {
    fontSize: Typography.sizes.sm,
  },
});
