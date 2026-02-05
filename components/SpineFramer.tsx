/**
 * SpineFramer Component
 *
 * First step in the two-step crop process for book spine scanning.
 * Allows users to pinch-to-zoom and pan the captured image to frame
 * the spine area within a fixed guide rectangle, producing a zoomed-in
 * intermediate image for precise corner-based cropping in SpineCropper.
 *
 * Features:
 * - Pinch-to-zoom (1x to 5x)
 * - Pan/drag to reposition the image
 * - Fixed crop frame overlay with darkened edges
 * - Crops the visible frame region as an intermediate image
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import {
  Spacing,
  BorderRadius,
  Typography,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

interface SpineFramerProps {
  imageUri: string;
  onFrameComplete: (croppedUri: string) => void;
  onCancel: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CONTAINER_WIDTH = SCREEN_WIDTH - Spacing.lg * 2;
const CONTAINER_HEIGHT = SCREEN_HEIGHT * 0.65;

// Fixed crop frame - generous size for rough framing
const FRAME_WIDTH = CONTAINER_WIDTH * 0.85;
const FRAME_HEIGHT = CONTAINER_HEIGHT * 0.90;

const MIN_SCALE = 1;
const MAX_SCALE = 5;

export function SpineFramer({
  imageUri,
  onFrameComplete,
  onCancel,
}: SpineFramerProps) {
  const { colors } = useTheme();
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [isLoaded, setIsLoaded] = useState(false);

  // Shared values for gesture transforms
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Shared values for display dimensions (accessible in worklets)
  const displayWidthSV = useSharedValue(0);
  const displayHeightSV = useSharedValue(0);

  const handleImageLoad = useCallback(
    (event: any) => {
      const { width, height } = event.source || { width: 0, height: 0 };
      if (width && height) {
        setImageSize({ width, height });

        const aspectRatio = width / height;
        let dw = CONTAINER_WIDTH;
        let dh = dw / aspectRatio;

        if (dh > CONTAINER_HEIGHT) {
          dh = CONTAINER_HEIGHT;
          dw = dh * aspectRatio;
        }

        setDisplaySize({ width: dw, height: dh });
        displayWidthSV.value = dw;
        displayHeightSV.value = dh;
        setIsLoaded(true);
      }
    },
    [displayWidthSV, displayHeightSV]
  );

  // Pinch gesture for zooming
  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      'worklet';
      const newScale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, savedScale.value * e.scale)
      );
      scale.value = newScale;

      // Re-clamp translation at new scale
      const maxTx = Math.max(
        0,
        (displayWidthSV.value * newScale - FRAME_WIDTH) / 2
      );
      const maxTy = Math.max(
        0,
        (displayHeightSV.value * newScale - FRAME_HEIGHT) / 2
      );
      translateX.value = Math.max(-maxTx, Math.min(maxTx, translateX.value));
      translateY.value = Math.max(-maxTy, Math.min(maxTy, translateY.value));
    })
    .onEnd(() => {
      'worklet';
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Pan gesture for dragging the image
  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onUpdate((e) => {
      'worklet';
      const newTx = savedTranslateX.value + e.translationX;
      const newTy = savedTranslateY.value + e.translationY;

      const maxTx = Math.max(
        0,
        (displayWidthSV.value * scale.value - FRAME_WIDTH) / 2
      );
      const maxTy = Math.max(
        0,
        (displayHeightSV.value * scale.value - FRAME_HEIGHT) / 2
      );
      translateX.value = Math.max(-maxTx, Math.min(maxTx, newTx));
      translateY.value = Math.max(-maxTy, Math.min(maxTy, newTy));
    })
    .onEnd(() => {
      'worklet';
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const combinedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  /**
   * Crop the visible frame region from the original image.
   *
   * Coordinate mapping:
   * - The image display view is centered in the container.
   * - The transform (scale + translate) is applied around the image center.
   * - The fixed frame is centered in the container.
   * - We map the frame rectangle back through the inverse transform to
   *   find the corresponding region in the original image.
   */
  const handleFrameCrop = async () => {
    if (
      !imageSize.width ||
      !imageSize.height ||
      !displaySize.width ||
      !displaySize.height
    )
      return;

    setIsProcessing(true);

    try {
      const currentScale = scale.value;
      const currentTx = translateX.value;
      const currentTy = translateY.value;

      // Map frame corners to image display coordinates.
      // Container-relative coords use center as origin.
      // Image display coord = (containerRel - translate) / scale + displaySize/2
      const imgDispLeft =
        (-FRAME_WIDTH / 2 - currentTx) / currentScale + displaySize.width / 2;
      const imgDispTop =
        (-FRAME_HEIGHT / 2 - currentTy) / currentScale +
        displaySize.height / 2;
      const imgDispRight =
        (FRAME_WIDTH / 2 - currentTx) / currentScale + displaySize.width / 2;
      const imgDispBottom =
        (FRAME_HEIGHT / 2 - currentTy) / currentScale +
        displaySize.height / 2;

      // Convert to original image pixel coordinates
      const scaleToOrigX = imageSize.width / displaySize.width;
      const scaleToOrigY = imageSize.height / displaySize.height;

      const origLeft = imgDispLeft * scaleToOrigX;
      const origTop = imgDispTop * scaleToOrigY;
      const origRight = imgDispRight * scaleToOrigX;
      const origBottom = imgDispBottom * scaleToOrigY;

      // Clamp to image bounds
      const cropX = Math.max(0, Math.floor(origLeft));
      const cropY = Math.max(0, Math.floor(origTop));
      const cropRight = Math.min(imageSize.width, Math.ceil(origRight));
      const cropBottom = Math.min(imageSize.height, Math.ceil(origBottom));
      const cropWidth = cropRight - cropX;
      const cropHeight = cropBottom - cropY;

      if (cropWidth <= 0 || cropHeight <= 0) {
        console.error('Invalid crop dimensions');
        setIsProcessing(false);
        return;
      }

      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX: cropX,
              originY: cropY,
              width: cropWidth,
              height: cropHeight,
            },
          },
        ],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );

      onFrameComplete(result.uri);
    } catch (error) {
      console.error('Failed to frame crop:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Overlay strip dimensions
  const overlayVerticalHeight = (CONTAINER_HEIGHT - FRAME_HEIGHT) / 2;
  const overlaySideWidth = (CONTAINER_WIDTH - FRAME_WIDTH) / 2;

  return (
    <View style={[styles.container, { backgroundColor: colors.primary }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textInverse }]}>
          Zoom & Frame
        </Text>
        <Text style={[styles.subtitle, { color: colors.textInverse }]}>
          Pinch to zoom and drag to position the spine
        </Text>
      </View>

      {/* Image container with gesture handling */}
      <View style={styles.imageWrapper}>
        <View
          style={[
            styles.outerContainer,
            {
              width: CONTAINER_WIDTH,
              height: CONTAINER_HEIGHT,
              backgroundColor: colors.primaryDark,
            },
          ]}
        >
          {/* Zoomable/pannable image */}
          <GestureDetector gesture={combinedGesture}>
            <Animated.View
              style={[
                {
                  width: displaySize.width || CONTAINER_WIDTH,
                  height: displaySize.height || CONTAINER_HEIGHT,
                },
                animatedStyle,
              ]}
            >
              <Image
                source={{ uri: imageUri }}
                style={styles.image}
                contentFit="contain"
                onLoad={handleImageLoad}
              />
            </Animated.View>
          </GestureDetector>

          {/* Fixed frame overlay - darkened edges with clear center */}
          {isLoaded && (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {/* Top dark strip */}
              <View
                style={{
                  width: CONTAINER_WIDTH,
                  height: overlayVerticalHeight,
                  backgroundColor: colors.overlay,
                }}
              />
              {/* Middle row: left dark | frame cutout | right dark */}
              <View style={{ flexDirection: 'row', height: FRAME_HEIGHT }}>
                <View
                  style={{
                    width: overlaySideWidth,
                    height: FRAME_HEIGHT,
                    backgroundColor: colors.overlay,
                  }}
                />
                <View
                  style={[
                    styles.cropFrame,
                    {
                      width: FRAME_WIDTH,
                      height: FRAME_HEIGHT,
                      borderColor: colors.accent,
                    },
                  ]}
                />
                <View
                  style={{
                    width: overlaySideWidth,
                    height: FRAME_HEIGHT,
                    backgroundColor: colors.overlay,
                  }}
                />
              </View>
              {/* Bottom dark strip */}
              <View
                style={{
                  width: CONTAINER_WIDTH,
                  height: overlayVerticalHeight,
                  backgroundColor: colors.overlay,
                }}
              />
            </View>
          )}
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <Pressable
          style={[
            styles.button,
            { backgroundColor: colors.textInverse },
          ]}
          onPress={onCancel}
          disabled={isProcessing}
        >
          <Ionicons name="close" size={24} color={colors.text} />
          <Text style={[styles.buttonText, { color: colors.text }]}>
            Cancel
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.button,
            { backgroundColor: colors.accent },
          ]}
          onPress={handleFrameCrop}
          disabled={isProcessing || !isLoaded}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Ionicons
              name="arrow-forward"
              size={24}
              color={colors.textInverse}
            />
          )}
          <Text style={[styles.buttonText, { color: colors.textInverse }]}>
            {isProcessing ? 'Processing...' : 'Next'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  title: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  subtitle: {
    fontSize: Typography.sizes.sm,
    opacity: 0.8,
    marginTop: Spacing.xs,
  },
  imageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  outerContainer: {
    overflow: 'hidden',
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  cropFrame: {
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.lg,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    minWidth: 120,
  },
  buttonText: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
});

export default SpineFramer;
