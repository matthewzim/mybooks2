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
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '@/contexts/AuthContext';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Input, Button } from '@/components/ui';
import {
  Spacing,
  BorderRadius,
  Typography,
  Shadows,
  ThemeColors,
  getFontFamily,
  getSerifFontFamily,
} from '@/constants/theme';
import { FREE_TIER_LIMITS } from '@/services/revenuecat';
import { bookshelvesService } from '@/services/bookshelves';
import { booksService } from '@/services/books';
import { accountService } from '@/services/account';
import { authService } from '@/services/auth';
import { supabase } from '@/services/supabase';
import { widgetManager } from '@/utils/widget';
import type { Bookshelf } from '@/types';

interface GoodreadsCsvBook {
  title: string;
  author: string;
}

const GOODREADS_TITLE_COLUMN_INDEX = 1;
const GOODREADS_AUTHOR_COLUMN_INDEX = 2;
const ONBOARDING_COMPLETE_KEY = 'onboarding_complete';

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
  const { user, updateProfile, restartAnonymousSession } = useAuth();
  const { isPro } = useRevenueCat();
  const { colors } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [publicUsername, setPublicUsername] = useState(user?.public_username || '');
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [showGoodreadsImportModal, setShowGoodreadsImportModal] = useState(false);
  const [isImportingGoodreads, setIsImportingGoodreads] = useState(false);
  const [isResettingData, setIsResettingData] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

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
      let placeholderCount = 0;

      for (const csvBook of uniquePairs) {
        const { data: matchedBook, error: matchError } = await supabase
          .from('books')
          .select('id,title,author,image_url')
          .eq('title', csvBook.title)
          .eq('author', csvBook.author)
          .limit(1)
          .maybeSingle();

        if (matchError) {
          console.error('Book match query failed:', matchError);
          continue;
        }

        const createResult = matchedBook
          ? await booksService.createBook({
              title: matchedBook.title,
              author: matchedBook.author,
              shelf_id: destinationShelf.id,
              book_id: matchedBook.id,
            })
          : await booksService.createBook({
              title: csvBook.title,
              author: csvBook.author,
              shelf_id: destinationShelf.id,
              is_community: false,
            });

        if (!createResult.error) {
          importedCount += 1;
          if (!matchedBook?.image_url) {
            placeholderCount += 1;
          }
        }
      }

      setShowGoodreadsImportModal(false);
      Alert.alert(
        'Goodreads Import Complete',
        `Added ${importedCount} book${importedCount === 1 ? '' : 's'} to "${destinationShelf.name}".${placeholderCount > 0 ? `\n${placeholderCount} book${placeholderCount === 1 ? ' uses' : ' use'} a placeholder spine until a scanned spine is added.` : ''}`
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
        setIsEditingUsername(false);
        setUsernameError(null);
        Alert.alert('Success', 'Profile updated successfully');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle public username save
   */
  const handleSaveUsername = async () => {
    const trimmed = publicUsername.trim().toLowerCase();

    if (!trimmed) {
      // Allow clearing the username
      setIsSavingUsername(true);
      try {
        const result = await updateProfile({ public_username: null });
        if (result.error) {
          Alert.alert('Error', result.error.message);
        } else {
          setIsEditingUsername(false);
          setUsernameError(null);
          Alert.alert('Success', 'Public username removed');
        }
      } catch {
        Alert.alert('Error', 'Failed to update username');
      } finally {
        setIsSavingUsername(false);
      }
      return;
    }

    // Validate format: alphanumeric, underscores, periods, 3-30 chars
    if (!/^[a-z0-9_.]{3,30}$/.test(trimmed)) {
      setUsernameError('3-30 characters, only letters, numbers, underscores, and periods');
      return;
    }

    setIsSavingUsername(true);
    setUsernameError(null);

    try {
      // Check availability
      const availResult = await authService.checkUsernameAvailability(trimmed);
      if (availResult.error) {
        Alert.alert('Error', availResult.error.message);
        return;
      }
      if (!availResult.data) {
        setUsernameError('This username is already taken');
        return;
      }

      const result = await updateProfile({ public_username: trimmed });
      if (result.error) {
        if (result.error.message.includes('unique') || result.error.message.includes('duplicate')) {
          setUsernameError('This username is already taken');
        } else {
          Alert.alert('Error', result.error.message);
        }
      } else {
        setIsEditingUsername(false);
        setUsernameError(null);
        Alert.alert('Success', 'Public username updated');
      }
    } catch {
      Alert.alert('Error', 'Failed to update username');
    } finally {
      setIsSavingUsername(false);
    }
  };

  /**
   * Navigate to premium/payment screen
   */
  const handleUpgrade = () => {
    router.push('/payment');
  };

  const resetLocalAppState = async () => {
    await Promise.all([
      AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY),
      widgetManager.clearWidgetData(),
    ]);
  };

  const navigateToFreshOnboarding = (successTitle: string, successMessage: string) => {
    setName('');
    setIsEditing(false);

    Alert.alert(successTitle, successMessage, [
      {
        text: 'Continue',
        onPress: () => router.replace('/onboarding'),
      },
    ]);
  };

  const completeAccountDeletion = async () => {
    await resetLocalAppState();

    const sessionResult = await restartAnonymousSession();
    if (sessionResult.error) {
      Alert.alert('Session Error', sessionResult.error.message);
      return;
    }

    navigateToFreshOnboarding(
      'Account Deleted',
      'Your previous account has been deleted. A fresh anonymous account is ready if you want to keep using the app.'
    );
  };

  const handleResetData = () => {
    if (!user || isResettingData || isDeletingAccount) {
      return;
    }

    Alert.alert(
      'Reset Data',
      'This will erase your bookshelves, books, uploaded images, widget data, and onboarding progress. Your account will remain active.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Data',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirm Reset',
              'This action cannot be undone. Do you want to reset all of your data and start over?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Reset',
                  style: 'destructive',
                  onPress: async () => {
                    setIsResettingData(true);

                    try {
                      const result = await accountService.resetMyData(user);
                      if (result.error) {
                        Alert.alert('Reset Failed', result.error.message);
                        return;
                      }

                      await resetLocalAppState();
                      navigateToFreshOnboarding(
                        'Data Reset Complete',
                        'Your library has been reset and a new onboarding flow is ready.'
                      );
                    } catch (error) {
                      Alert.alert('Reset Failed', 'We could not reset your data. Please try again.');
                    } finally {
                      setIsResettingData(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    if (!user || isDeletingAccount || isResettingData) {
      return;
    }

    Alert.alert(
      'Delete Account',
      'This permanently deletes your account, bookshelves, uploaded books, images, widget data, and onboarding progress.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'This action is permanent and cannot be undone. Are you sure you want to delete your account?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Forever',
                  style: 'destructive',
                  onPress: async () => {
                    setIsDeletingAccount(true);

                    try {
                      const result = await accountService.deleteMyAccount(user);
                      if (result.error) {
                        Alert.alert('Deletion Failed', result.error.message);
                        return;
                      }

                      await completeAccountDeletion();
                    } catch (error) {
                      Alert.alert('Deletion Failed', 'We could not delete your account. Please try again.');
                    } finally {
                      setIsDeletingAccount(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Heading */}
        <View style={styles.headingContainer}>
          <Text style={[styles.heading, { color: colors.text }]}>Settings</Text>
        </View>

        {/* Profile Section */}
        <View style={styles.section}>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {/* Profile Info */}
            {isEditing ? (
              <>
                {/* Avatar */}
                <View style={styles.avatarContainer}>
                  <View style={styles.avatar}>
                    <LinearGradient
                      colors={['#c8642a', '#a24417']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0.85, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <Text style={[styles.avatarText, { color: colors.textInverse }]}>
                      {(user?.name || 'U')[0].toUpperCase()}
                    </Text>
                  </View>
                  {isPro && (
                    <View style={[styles.premiumBadge, { backgroundColor: colors.gilt, borderColor: colors.card }]}>
                      <Ionicons name="star" size={12} color="#ffffff" />
                    </View>
                  )}
                </View>

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
                        setPublicUsername(user?.public_username || '');
                        setIsEditingUsername(false);
                        setUsernameError(null);
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
              </>
            ) : (
              <View style={styles.profileRow}>
                <View style={styles.profileAvatarWrap}>
                  <View style={styles.avatar}>
                    <LinearGradient
                      colors={['#c8642a', '#a24417']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0.85, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <Text style={[styles.avatarText, { color: colors.textInverse }]}>
                      {(user?.name || 'U')[0].toUpperCase()}
                    </Text>
                  </View>
                  {isPro && (
                    <View style={[styles.profileBadge, { backgroundColor: colors.gilt, borderColor: colors.card }]}>
                      <Ionicons name="star" size={12} color="#ffffff" />
                    </View>
                  )}
                </View>
                <View style={styles.profileText}>
                  <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                    {user?.name || 'No name set'}
                  </Text>
                  <Text style={[styles.userHandle, { color: colors.textLight }]} numberOfLines={1}>
                    {user?.public_username ? `@${user.public_username}` : 'No username set'}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.profileEditButton,
                    { backgroundColor: colors.pill },
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => setIsEditing(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit profile"
                >
                  <Text style={[styles.editButtonText, { color: colors.primary }]}>Edit</Text>
                </Pressable>
              </View>
            )}

            {/* Public Username (shown while editing the profile) */}
            {isEditing && (
            <View style={[styles.usernameSection, { borderTopColor: colors.border }]}>
              {isEditingUsername ? (
                <View style={styles.editForm}>
                  <Input
                    label="Public Username"
                    value={publicUsername}
                    onChangeText={(text) => {
                      setPublicUsername(text.toLowerCase().replace(/[^a-z0-9_.]/g, ''));
                      setUsernameError(null);
                    }}
                    placeholder="e.g. bookworm42"
                    autoCapitalize="none"
                    autoCorrect={false}
                    colors={colors}
                  />
                  {usernameError && (
                    <Text style={[styles.usernameError, { color: colors.error }]}>{usernameError}</Text>
                  )}
                  <Text style={[styles.usernameHint, { color: colors.textSecondary }]}>
                    Others can find you by this unique username
                  </Text>
                  <View style={styles.editButtons}>
                    <Button
                      title="Cancel"
                      variant="outline"
                      onPress={() => {
                        setPublicUsername(user?.public_username || '');
                        setIsEditingUsername(false);
                        setUsernameError(null);
                      }}
                      size="sm"
                      colors={colors}
                    />
                    <Button
                      title="Save"
                      onPress={handleSaveUsername}
                      loading={isSavingUsername}
                      size="sm"
                      colors={colors}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.usernameDisplay}>
                  <View style={styles.usernameLabelRow}>
                    <Ionicons name="at" size={16} color={colors.textSecondary} />
                    <Text style={[styles.usernameLabel, { color: colors.textSecondary }]}>Public Username</Text>
                  </View>
                  <Text style={[styles.usernameValue, { color: colors.text }]}>
                    {user?.public_username ? `@${user.public_username}` : 'Not set'}
                  </Text>
                  <Pressable
                    style={styles.editButton}
                    onPress={() => setIsEditingUsername(true)}
                  >
                    <Ionicons name="pencil" size={14} color={colors.primary} />
                    <Text style={[styles.editButtonText, { color: colors.primary }]}>
                      {user?.public_username ? 'Edit Username' : 'Add Username'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
            )}
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
                isPro || FREE_TIER_LIMITS.CAN_USE_WIDGET
                  ? 'Display a bookshelf on your home screen'
                  : 'Premium feature - Upgrade to unlock'
              }
              colors={colors}
              onPress={() => {
                if (isPro || FREE_TIER_LIMITS.CAN_USE_WIDGET) {
                  Alert.alert(
                    'Widget Setup',
                    'To add the widget:\n\n1. Long press on your home screen\n2. Tap the + button\n3. Search for "Virtual Library"\n4. Select Medium (one row) or Large (two rows)\n5. Long-press the widget and tap "Edit Widget" to choose a bookshelf'
                  );
                } else {
                  router.push('/payment');
                }
              }}
              trailing={
                !(isPro || FREE_TIER_LIMITS.CAN_USE_WIDGET) ? (
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

        {/* Subscription Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Subscription</Text>
          <Pressable
            style={({ pressed }) => [styles.card, styles.premiumCard, pressed && { opacity: 0.94 }]}
            onPress={handleUpgrade}
          >
            <LinearGradient
              colors={['#3a2418', '#6e4324']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.premiumContent}>
              <View style={styles.premiumHeader}>
                <Ionicons
                  name="star"
                  size={26}
                  color="#e6b866"
                />
                <View style={styles.premiumText}>
                  <Text style={styles.premiumTitle}>
                    {isPro ? 'Premium Member' : 'Go Premium'}
                  </Text>
                  <Text style={styles.premiumDescription}>
                    {isPro
                      ? 'Thank you for your support!'
                      : 'Unlock unlimited bookshelves and home screen widget'}
                  </Text>
                </View>
              </View>
              {!isPro && (
                <View style={styles.premiumChevron}>
                  <Ionicons name="chevron-forward" size={16} color="#f7efe0" />
                </View>
              )}
            </View>
          </Pressable>
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
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: '#b06a5c' }]}>Danger Zone</Text>
          <View style={styles.dangerActions}>
            <Button
              title={isDeletingAccount ? 'Deleting Account...' : 'Account Deletion'}
              variant="danger"
              onPress={handleDeleteAccount}
              disabled={isDeletingAccount || isResettingData}
              loading={isDeletingAccount}
              colors={colors}
              style={styles.dangerButton}
            />
            <Button
              title={isResettingData ? 'Resetting Data...' : 'Reset Data'}
              variant="danger"
              onPress={handleResetData}
              disabled={isResettingData || isDeletingAccount}
              loading={isResettingData}
              colors={colors}
              style={styles.dangerButton}
            />
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
      </KeyboardAvoidingView>

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
        <View style={[styles.rowIconChip, { backgroundColor: colors.pill }]}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
          {subtitle && <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
        </View>
      </View>
      {trailing ||
        (onPress && (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textLight}
          />
        ))}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          { borderBottomColor: colors.borderLight },
          pressed && { backgroundColor: colors.backgroundDark },
        ]}
        onPress={onPress}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>{content}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.md,
  },
  headingContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  heading: {
    fontSize: 34,
    fontFamily: getSerifFontFamily('medium'),
  },
  section: {
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('semibold'),
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  card: {
    borderRadius: BorderRadius.xxl,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  avatarContainer: {
    alignItems: 'center',
    paddingTop: Spacing.lg,
    position: 'relative',
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    fontSize: 26,
    fontFamily: getSerifFontFamily('medium'),
  },
  premiumBadge: {
    position: 'absolute',
    bottom: 0,
    right: '38%',
    borderRadius: 12,
    padding: 4,
    borderWidth: 2,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  profileAvatarWrap: {
    position: 'relative',
  },
  profileBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderRadius: 12,
    padding: 4,
    borderWidth: 2,
  },
  profileText: {
    flex: 1,
  },
  profileEditButton: {
    borderRadius: BorderRadius.full,
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
  },
  userName: {
    fontSize: 22,
    fontFamily: getSerifFontFamily('medium'),
  },
  userHandle: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: BorderRadius.full,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xxs,
  },
  editButtonText: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('semibold'),
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
    borderRadius: BorderRadius.xxl,
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
    fontSize: 20,
    fontFamily: getSerifFontFamily('medium'),
    color: '#f7efe0',
  },
  premiumDescription: {
    fontSize: Typography.sizes.sm,
    marginTop: 2,
    color: 'rgba(247, 239, 224, 0.72)',
  },
  premiumChevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
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
  rowIconChip: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('medium'),
  },
  rowSubtitle: {
    fontSize: Typography.sizes.sm,
    marginTop: 2,
  },
  usernameSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    paddingTop: Spacing.md,
  },
  usernameDisplay: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  usernameLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  usernameLabel: {
    fontSize: Typography.sizes.sm,
  },
  usernameValue: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.medium,
  },
  usernameError: {
    fontSize: Typography.sizes.sm,
    marginTop: -Spacing.xs,
  },
  usernameHint: {
    fontSize: Typography.sizes.xs,
    marginTop: -Spacing.xs,
  },
  bottomPadding: {
    height: 40,
  },
  dangerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  dangerButton: {
    flex: 1,
    minWidth: 0,
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
