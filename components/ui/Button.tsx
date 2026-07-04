/**
 * Button Component
 *
 * Reusable button component with various variants and states.
 * Supports theme-aware colors via the colors prop.
 */

import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  ThemeColors,
  Animations,
  getFontFamily,
} from '@/constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
  colors?: ThemeColors;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  textStyle,
  accessibilityLabel,
  colors,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const themeColors = colors || Colors;
  const scale = useRef(new Animated.Value(1)).current;

  const animateScale = (toValue: number) => {
    Animated.timing(scale, {
      toValue,
      duration: Animations.fast,
      useNativeDriver: true,
    }).start();
  };

  const getVariantStyle = (): ViewStyle => {
    switch (variant) {
      case 'primary':
        return { backgroundColor: themeColors.background, borderWidth: 1, borderColor: themeColors.primary };
      case 'secondary':
        return { backgroundColor: themeColors.background, borderWidth: 1, borderColor: themeColors.secondary };
      case 'outline':
        return { backgroundColor: themeColors.background, borderWidth: 1, borderColor: themeColors.primary };
      case 'ghost':
        return { backgroundColor: 'transparent' };
      case 'danger':
        return { backgroundColor: themeColors.dangerBg, borderWidth: 1, borderColor: themeColors.dangerBorder };
      default:
        return { backgroundColor: themeColors.background, borderWidth: 1, borderColor: themeColors.primary };
    }
  };

  const getTextColor = (): string => {
    switch (variant) {
      case 'danger':
        return themeColors.error;
      case 'ghost':
        return themeColors.primary;
      default:
        return themeColors.primary;
    }
  };

  const getLoaderColor = (): string => (
    variant === 'outline' || variant === 'ghost'
      ? themeColors.primary
      : themeColors.textInverse
  );

  return (
    <Animated.View
      style={[
        fullWidth && styles.fullWidth,
        { transform: [{ scale }] },
      ]}
    >
      <Pressable
        style={({ pressed }) => [
          styles.base,
          getVariantStyle(),
          styles[`size_${size}`],
          isDisabled && styles.disabled,
          pressed && !isDisabled && styles.pressed,
          style,
        ]}
        onPress={onPress}
        onPressIn={() => !isDisabled && animateScale(0.98)}
        onPressOut={() => animateScale(1)}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || title}
        accessibilityState={{ disabled: isDisabled }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={getLoaderColor()} />
        ) : (
          <Text
            style={[
              styles.text,
              { color: getTextColor() },
              styles[`text_${size}`],
              textStyle,
            ]}
          >
            {title}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    minWidth: 120,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.94,
  },
  size_sm: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    minHeight: 40,
  },
  size_md: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    minHeight: 48,
  },
  size_lg: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    minHeight: 56,
  },
  text: {
    fontFamily: getFontFamily('semibold'),
  },
  text_sm: {
    fontSize: Typography.sizes.sm,
  },
  text_md: {
    fontSize: Typography.sizes.md,
  },
  text_lg: {
    fontSize: Typography.sizes.lg,
  },
});

export default Button;
