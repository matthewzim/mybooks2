/**
 * Settings Screen
 *
 * User account settings and app configuration.
 * Features:
 * - Profile management
 * - Premium subscription
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
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { Input, Button } from '@/components/ui';
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  Shadows,
} from '@/constants/theme';

export default function SettingsScreen() {
  const { user, signOut, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [isLoading, setIsLoading] = useState(false);
  const [notifications, setNotifications] = useState(true);

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
   * Handle sign out
   */
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  /**
   * Navigate to premium/payment screen
   */
  const handleUpgrade = () => {
    router.push('/payment');
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.card}>
            {/* Avatar */}
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(user?.name || user?.email || 'U')[0].toUpperCase()}
                </Text>
              </View>
              {user?.is_premium && (
                <View style={styles.premiumBadge}>
                  <Ionicons name="star" size={12} color={Colors.starFilled} />
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
                  />
                  <Button
                    title="Save"
                    onPress={handleSaveProfile}
                    loading={isLoading}
                    size="sm"
                  />
                </View>
              </View>
            ) : (
              <View style={styles.profileInfo}>
                <Text style={styles.userName}>{user?.name || 'No name set'}</Text>
                <Text style={styles.userEmail}>{user?.email}</Text>
                <Pressable
                  style={styles.editButton}
                  onPress={() => setIsEditing(true)}
                >
                  <Ionicons name="pencil" size={16} color={Colors.primary} />
                  <Text style={styles.editButtonText}>Edit Profile</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Premium Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <Pressable
            style={[styles.card, styles.premiumCard]}
            onPress={handleUpgrade}
          >
            <View style={styles.premiumContent}>
              <View style={styles.premiumHeader}>
                <Ionicons
                  name={user?.is_premium ? 'star' : 'star-outline'}
                  size={28}
                  color={user?.is_premium ? Colors.starFilled : Colors.primary}
                />
                <View style={styles.premiumText}>
                  <Text style={styles.premiumTitle}>
                    {user?.is_premium ? 'Premium Member' : 'Go Premium'}
                  </Text>
                  <Text style={styles.premiumDescription}>
                    {user?.is_premium
                      ? 'Thank you for your support!'
                      : 'Unlock unlimited bookshelves and community access'}
                  </Text>
                </View>
              </View>
              {!user?.is_premium && (
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={Colors.textSecondary}
                />
              )}
            </View>
          </Pressable>
        </View>

        {/* Preferences Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.card}>
            <SettingsRow
              icon="notifications-outline"
              title="Push Notifications"
              subtitle="Receive updates about your library"
              trailing={
                <Switch
                  value={notifications}
                  onValueChange={setNotifications}
                  trackColor={{
                    false: Colors.border,
                    true: Colors.primary,
                  }}
                />
              }
            />
          </View>
        </View>

        {/* Widget Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>iOS Widget</Text>
          <View style={styles.card}>
            <SettingsRow
              icon="apps-outline"
              title="Home Screen Widget"
              subtitle="Display a bookshelf on your home screen"
              onPress={() => {
                Alert.alert(
                  'Widget Setup',
                  'To add the widget:\n\n1. Long press on your home screen\n2. Tap the + button\n3. Search for "Virtual Library"\n4. Select the widget size\n5. Choose a bookshelf to display'
                );
              }}
            />
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <SettingsRow
              icon="information-circle-outline"
              title="App Version"
              subtitle="1.0.0"
            />
            <SettingsRow
              icon="document-text-outline"
              title="Terms of Service"
              onPress={() => {}}
            />
            <SettingsRow
              icon="shield-outline"
              title="Privacy Policy"
              onPress={() => {}}
            />
          </View>
        </View>

        {/* Sign Out */}
        <View style={styles.section}>
          <Pressable
            style={[styles.card, styles.signOutCard]}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={20} color={Colors.error} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
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
}

function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
  trailing,
}: SettingsRowProps) {
  const content = (
    <View style={styles.rowContainer}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={22} color={Colors.primary} />
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{title}</Text>
          {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {trailing ||
        (onPress && (
          <Ionicons
            name="chevron-forward"
            size={20}
            color={Colors.textSecondary}
          />
        ))}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          pressed && styles.rowPressed,
        ]}
        onPress={onPress}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundDark,
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
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.background,
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
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    color: Colors.textInverse,
  },
  premiumBadge: {
    position: 'absolute',
    bottom: 0,
    right: '35%',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 4,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  profileInfo: {
    alignItems: 'center',
    padding: Spacing.lg,
  },
  userName: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  editButtonText: {
    color: Colors.primary,
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
    color: Colors.text,
  },
  premiumDescription: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowPressed: {
    backgroundColor: Colors.backgroundDark,
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
    color: Colors.text,
  },
  rowSubtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  signOutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  signOutText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
    color: Colors.error,
  },
  bottomPadding: {
    height: 40,
  },
});
