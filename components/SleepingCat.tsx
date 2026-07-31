/**
 * SleepingCat Component
 *
 * The cat-asleep-on-a-stack-of-books mark, with a few "z"s that drift up
 * and to the left from just above the cat's head. Used on the startup
 * loading screen and the first page of onboarding.
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Platform, StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { getSerifFontFamily } from '@/constants/theme';

const SLEEP_IMAGE = require('@/assets/images/sleep.png');

// One full float takes this long; the z's are staggered evenly across it so
// there is always one on the way up.
const FLOAT_DURATION = 5200;

/**
 * Per-z character: each one drifts a slightly different distance at a
 * slightly different size so the trail never looks mechanical. Distances and
 * font sizes are fractions of the cat's width.
 */
const FLOATING_ZS = [
  { fontSize: 0.15, driftX: 0.3, driftY: 0.52, sway: 0.05, tilt: ['-16deg', '4deg', '-12deg', '2deg'] },
  { fontSize: 0.11, driftX: 0.22, driftY: 0.44, sway: -0.04, tilt: ['8deg', '-8deg', '6deg', '-4deg'] },
  { fontSize: 0.18, driftX: 0.36, driftY: 0.6, sway: 0.07, tilt: ['-6deg', '10deg', '-4deg', '8deg'] },
  { fontSize: 0.13, driftX: 0.26, driftY: 0.48, sway: -0.06, tilt: ['12deg', '-6deg', '10deg', '-2deg'] },
  { fontSize: 0.1, driftX: 0.18, driftY: 0.4, sway: 0.03, tilt: ['-10deg', '6deg', '-8deg', '4deg'] },
] as const;

// Where the z's are born: just above the cat's head, in from the left edge.
const ORIGIN_X = 0.17;
const ORIGIN_Y = 0.06;

interface SleepingCatProps {
  /** Width and height of the cat image in points. */
  size?: number;
  /** Colour of the floating z's. */
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export function SleepingCat({ size = 220, color = '#8a6a4a', style }: SleepingCatProps) {
  const progress = useRef(FLOATING_ZS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const stagger = FLOAT_DURATION / FLOATING_ZS.length;

    // Each z runs its own loop, started one stagger apart so the trail stays
    // evenly spaced. The delay has to sit outside the animation: a loop nested
    // in an Animated.sequence only ever runs a single iteration.
    const loops = progress.map((value) =>
      Animated.loop(
        Animated.timing(value, {
          toValue: 1,
          duration: FLOAT_DURATION,
          easing: Easing.linear,
          // On web, Animated.loop trusts this flag and hands off to a native
          // loop that isn't there, so the z would rise once and freeze.
          useNativeDriver: Platform.OS !== 'web',
        })
      )
    );

    const timers = loops.map((loop, index) =>
      setTimeout(() => loop.start(), index * stagger)
    );

    return () => {
      timers.forEach(clearTimeout);
      loops.forEach((loop) => loop.stop());
      progress.forEach((value) => value.setValue(0));
    };
  }, [progress]);

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Image
        source={SLEEP_IMAGE}
        style={{ width: size, height: size }}
        contentFit="contain"
        // The mark is decorative; the surrounding copy carries the meaning.
        accessible={false}
      />

      <View style={styles.zLayer}>
        {FLOATING_ZS.map((z, index) => {
          const value = progress[index];

          return (
            <Animated.Text
              key={index}
              style={[
                styles.z,
                {
                  color,
                  fontSize: size * z.fontSize,
                  left: size * ORIGIN_X,
                  top: size * ORIGIN_Y,
                  opacity: value.interpolate({
                    inputRange: [0, 0.14, 0.6, 1],
                    outputRange: [0, 1, 0.75, 0],
                  }),
                  transform: [
                    {
                      translateX: value.interpolate({
                        inputRange: [0, 0.35, 0.7, 1],
                        outputRange: [
                          0,
                          size * (-z.driftX * 0.3 + z.sway),
                          size * (-z.driftX * 0.72 - z.sway),
                          size * -z.driftX,
                        ],
                      }),
                    },
                    {
                      translateY: value.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, size * -z.driftY],
                      }),
                    },
                    {
                      scale: value.interpolate({
                        inputRange: [0, 0.2, 1],
                        outputRange: [0.5, 0.95, 1.3],
                      }),
                    },
                    {
                      rotate: value.interpolate({
                        inputRange: [0, 0.33, 0.66, 1],
                        outputRange: [...z.tilt],
                      }),
                    },
                  ],
                },
              ]}
            >
              z
            </Animated.Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    // The z's drift past the top-left of the image and must not be clipped.
    overflow: 'visible',
  },
  zLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'visible',
    pointerEvents: 'none',
  },
  z: {
    position: 'absolute',
    fontFamily: getSerifFontFamily('mediumItalic'),
    // Native loads a dedicated italic face; web needs the style flag.
    ...(Platform.OS === 'web' ? { fontStyle: 'italic' as const } : {}),
  },
});

export default SleepingCat;
