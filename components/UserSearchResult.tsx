/**
 * UserSearchResult Component
 *
 * Displays a single user search result with avatar and name.
 * Tappable to navigate to user's profile page.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Typography, BorderRadius, getFontFamily } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

interface UserSearchResultProps {
  user: {
    id: string;
    name: string | null;
    public_username?: string | null;
  };
  onPress: (user: { id: string; name: string | null; public_username?: string | null }) => void;
}

export function UserSearchResult({ user, onPress }: UserSearchResultProps) {
  const { colors } = useTheme();
  const displayName = user.name || 'Anonymous User';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: pressed ? colors.backgroundDark : colors.card,
          borderColor: colors.border,
        },
      ]}
      onPress={() => onPress(user)}
    >
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {displayName}
        </Text>
        {user.public_username ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]} numberOfLines={1}>@{user.public_username}</Text>
        ) : (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>View public bookshelves</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: Typography.sizes.lg,
    fontFamily: getFontFamily('bold'),
    color: '#ffffff',
  },
  info: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  name: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('semibold'),
  },
  hint: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
    marginTop: Spacing.xxs,
  },
});

export default UserSearchResult;
