/**
 * Input Component
 *
 * Reusable text input component with label, error state, and icons.
 * Supports theme-aware colors via the colors prop.
 */

import React, { useRef, useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  Pressable,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography, ThemeColors, getFontFamily } from '@/constants/theme';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  containerStyle?: ViewStyle;
  colors?: ThemeColors;
}

export function Input({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  onRightIconPress,
  containerStyle,
  secureTextEntry,
  colors,
  onFocus: onFocusProp,
  onBlur: onBlurProp,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const themeColors = colors || Colors;
  const inputRef = useRef<TextInput>(null);

  const showPasswordToggle = secureTextEntry && !rightIcon;
  const actualSecureTextEntry = secureTextEntry && !isPasswordVisible;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={[styles.label, { color: themeColors.text }]}>{label}</Text>}

      <Pressable
        style={[
          styles.inputContainer,
          { backgroundColor: themeColors.inputBackground, borderColor: themeColors.border },
          isFocused && {
            borderColor: themeColors.primary,
            shadowColor: themeColors.primary,
            shadowOpacity: 0.14,
            shadowRadius: 12,
            elevation: 0,
          },
          error && { borderColor: themeColors.error },
        ]}
        onPress={() => inputRef.current?.focus()}
      >
        {leftIcon && (
          <Ionicons
            name={leftIcon}
            size={20}
            color={error ? themeColors.error : themeColors.textSecondary}
            style={styles.leftIcon}
          />
        )}

        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            { color: themeColors.text },
            leftIcon && styles.inputWithLeftIcon,
            (rightIcon || showPasswordToggle) && styles.inputWithRightIcon,
          ]}
          placeholderTextColor={themeColors.textLight}
          onFocus={(e) => { setIsFocused(true); onFocusProp?.(e); }}
          onBlur={(e) => { setIsFocused(false); onBlurProp?.(e); }}
          secureTextEntry={actualSecureTextEntry}
          showSoftInputOnFocus={props.showSoftInputOnFocus ?? true}
          {...props}
        />

        {showPasswordToggle && (
          <Pressable
            style={styles.rightIconButton}
            onPress={() => setIsPasswordVisible(!isPasswordVisible)}
            hitSlop={8}
          >
            <Ionicons
              name={isPasswordVisible ? 'eye-off' : 'eye'}
              size={20}
              color={themeColors.textSecondary}
            />
          </Pressable>
        )}

        {rightIcon && !showPasswordToggle && (
          <Pressable
            style={styles.rightIconButton}
            onPress={onRightIconPress}
            disabled={!onRightIconPress}
            hitSlop={8}
          >
            <Ionicons
              name={rightIcon}
              size={20}
              color={themeColors.textSecondary}
            />
          </Pressable>
        )}
      </Pressable>

      {error && <Text style={[styles.helperText, { color: themeColors.error }]}>{error}</Text>}
      {hint && !error && <Text style={[styles.helperText, { color: themeColors.textSecondary }]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('medium'),
    marginBottom: Spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    minHeight: 56,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('regular'),
  },
  inputWithLeftIcon: {
    paddingLeft: 0,
  },
  inputWithRightIcon: {
    paddingRight: 0,
  },
  leftIcon: {
    marginLeft: Spacing.md,
  },
  rightIconButton: {
    padding: Spacing.md,
  },
  helperText: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
    marginTop: Spacing.xs,
  },
});

export default Input;
