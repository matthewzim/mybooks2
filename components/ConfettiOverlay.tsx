/**
 * ConfettiOverlay
 *
 * A full-screen confetti animation powered by react-native-reanimated.
 * Renders falling coloured rectangles and circles for ~3 seconds.
 *
 * Usage:
 *   <ConfettiOverlay visible={showConfetti} onComplete={() => setShowConfetti(false)} />
 */

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

const CONFETTI_COUNT = 60;
const DURATION = 3000;

const COLORS = [
  '#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF',
  '#FF6EC7', '#A66CFF', '#FF8C32', '#54BAB9',
  '#F97B22', '#6C63FF', '#2ECC71', '#E74C3C',
];

interface Piece {
  x: number;
  delay: number;
  color: string;
  size: number;
  shape: 'rect' | 'circle';
  drift: number;
  rotation: number;
}

function ConfettiPiece({
  piece,
  screenHeight,
}: {
  piece: Piece;
  screenHeight: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      piece.delay,
      withTiming(1, { duration: DURATION - piece.delay, easing: Easing.in(Easing.quad) })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const translateY = -60 + progress.value * (screenHeight + 120);
    const translateX = piece.drift * progress.value * 80;
    const rotate = piece.rotation * progress.value * 720;
    const opacity = progress.value < 0.8 ? 1 : 1 - (progress.value - 0.8) / 0.2;

    return {
      transform: [
        { translateY },
        { translateX },
        { rotate: `${rotate}deg` },
      ],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: piece.x,
          top: 0,
          width: piece.size,
          height: piece.shape === 'rect' ? piece.size * 1.6 : piece.size,
          backgroundColor: piece.color,
          borderRadius: piece.shape === 'circle' ? piece.size / 2 : 2,
        },
        animatedStyle,
      ]}
    />
  );
}

interface ConfettiOverlayProps {
  visible: boolean;
  onComplete?: () => void;
}

export function ConfettiOverlay({ visible, onComplete }: ConfettiOverlayProps) {
  const { width, height } = useWindowDimensions();

  const pieces = useMemo<Piece[]>(() => {
    if (!visible) return [];
    return Array.from({ length: CONFETTI_COUNT }, () => ({
      x: Math.random() * width,
      delay: Math.random() * 800,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 6,
      shape: Math.random() > 0.5 ? 'rect' as const : 'circle' as const,
      drift: (Math.random() - 0.5) * 2,
      rotation: (Math.random() - 0.5) * 2,
    }));
  }, [visible, width]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      onComplete?.();
    }, DURATION + 200);
    return () => clearTimeout(timer);
  }, [visible, onComplete]);

  if (!visible) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="none">
      {pieces.map((piece, i) => (
        <ConfettiPiece key={i} piece={piece} screenHeight={height} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 9999,
  },
});

export default ConfettiOverlay;
