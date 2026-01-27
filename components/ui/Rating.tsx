/**
 * Rating Component
 *
 * Star rating component for book reviews.
 * Supports interactive (editable) and display-only modes.
 */

import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '@/constants/theme';

interface RatingProps {
  value: number;
  onChange?: (rating: number) => void;
  size?: number;
  maxStars?: number;
  readonly?: boolean;
}

export function Rating({
  value,
  onChange,
  size = 24,
  maxStars = 5,
  readonly = false,
}: RatingProps) {
  const handlePress = (starIndex: number) => {
    if (readonly || !onChange) return;

    // If tapping the same star, toggle between full and empty
    const newRating = starIndex + 1 === value ? starIndex : starIndex + 1;
    onChange(newRating);
  };

  return (
    <View style={styles.container}>
      {Array.from({ length: maxStars }).map((_, index) => {
        const isFilled = index < value;
        const isHalf = index === Math.floor(value) && value % 1 >= 0.5;

        let iconName: keyof typeof Ionicons.glyphMap = 'star-outline';
        if (isFilled) iconName = 'star';
        else if (isHalf) iconName = 'star-half';

        const Star = (
          <Ionicons
            name={iconName}
            size={size}
            color={isFilled || isHalf ? Colors.starFilled : Colors.starEmpty}
          />
        );

        if (readonly) {
          return (
            <View key={index} style={styles.star}>
              {Star}
            </View>
          );
        }

        return (
          <Pressable
            key={index}
            style={styles.star}
            onPress={() => handlePress(index)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${index + 1} out of ${maxStars} stars`}
          >
            {Star}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    marginHorizontal: 2,
  },
});

export default Rating;
