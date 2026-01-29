/**
 * SpineCropper Component
 *
 * Allows users to adjust a 4-corner crop region on a captured image.
 * Designed for cropping book spines from photos.
 *
 * Features:
 * - Displays captured image
 * - 4 draggable corner handles
 * - Visual crop boundary
 * - Auto-detects spine area (centered rectangle)
 * - Applies crop with expo-image-manipulator
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ActivityIndicator,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
} from '@/constants/theme';
import Svg, { Polygon, Circle, Line } from 'react-native-svg';

interface Point {
  x: number;
  y: number;
}

interface SpineCropperProps {
  imageUri: string;
  onCropComplete: (croppedUri: string) => void;
  onCancel: () => void;
}

const HANDLE_SIZE = 30;
const HANDLE_HIT_SLOP = 20;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Zoom bubble configuration
const ZOOM_BUBBLE_SIZE = 120;
const ZOOM_MAGNIFICATION = 2.5;
const ZOOM_BUBBLE_OFFSET_Y = 80; // Distance above the finger

// Dampening factor for less sensitive corner dragging (lower = less sensitive)
const DRAG_DAMPENING = 0.6;

// Calculate display dimensions for the image preview
const IMAGE_CONTAINER_WIDTH = SCREEN_WIDTH - Spacing.lg * 2;
const IMAGE_CONTAINER_HEIGHT = SCREEN_HEIGHT * 0.6;

export function SpineCropper({
  imageUri,
  onCropComplete,
  onCancel,
}: SpineCropperProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });

  // Initialize corner positions - will be set after image loads
  const [corners, setCorners] = useState<Point[]>([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ]);
  const [activeCorner, setActiveCorner] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  /**
   * Initialize crop region when image loads
   * Defaults to a centered vertical rectangle (book spine shape)
   */
  const handleImageLoad = useCallback((event: any) => {
    const { width, height } = event.source || { width: 0, height: 0 };

    if (width && height) {
      setImageSize({ width, height });

      // Calculate display dimensions maintaining aspect ratio
      const aspectRatio = width / height;
      let displayWidth = IMAGE_CONTAINER_WIDTH;
      let displayHeight = displayWidth / aspectRatio;

      if (displayHeight > IMAGE_CONTAINER_HEIGHT) {
        displayHeight = IMAGE_CONTAINER_HEIGHT;
        displayWidth = displayHeight * aspectRatio;
      }

      setDisplaySize({ width: displayWidth, height: displayHeight });

      // Initialize crop region as centered vertical rectangle
      // Typical book spine aspect ratio is about 1:3 to 1:4
      const spineWidth = displayWidth * 0.3;
      const spineHeight = displayHeight * 0.85;
      const centerX = displayWidth / 2;
      const centerY = displayHeight / 2;

      const initialCorners: Point[] = [
        { x: centerX - spineWidth / 2, y: centerY - spineHeight / 2 }, // top-left
        { x: centerX + spineWidth / 2, y: centerY - spineHeight / 2 }, // top-right
        { x: centerX + spineWidth / 2, y: centerY + spineHeight / 2 }, // bottom-right
        { x: centerX - spineWidth / 2, y: centerY + spineHeight / 2 }, // bottom-left
      ];

      setCorners(initialCorners);
      setIsInitialized(true);
    }
  }, []);

  /**
   * Handle corner drag with dampening for less sensitivity
   */
  const createPanResponder = useCallback((cornerIndex: number) => {
    let initialCornerPosition: Point | null = null;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Store the initial corner position when drag starts
        setCorners((prev) => {
          initialCornerPosition = { ...prev[cornerIndex] };
          return prev;
        });
        setActiveCorner(cornerIndex);
      },
      onPanResponderMove: (
        _event: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        if (!initialCornerPosition) return;

        // Apply dampening factor for less sensitive movement
        const dampenedDx = gestureState.dx * DRAG_DAMPENING;
        const dampenedDy = gestureState.dy * DRAG_DAMPENING;

        setCorners((prev) => {
          const newCorners = [...prev];
          const newX = Math.max(0, Math.min(displaySize.width, initialCornerPosition!.x + dampenedDx));
          const newY = Math.max(0, Math.min(displaySize.height, initialCornerPosition!.y + dampenedDy));
          newCorners[cornerIndex] = { x: newX, y: newY };
          return newCorners;
        });
      },
      onPanResponderRelease: () => {
        initialCornerPosition = null;
        setActiveCorner(null);
      },
    });
  }, [displaySize]);

  const panResponders = useMemo(() => {
    if (!isInitialized) return [];
    return [0, 1, 2, 3].map((i) => createPanResponder(i));
  }, [createPanResponder, isInitialized]);

  /**
   * Apply crop and return the cropped image
   */
  const handleCrop = async () => {
    if (!imageSize.width || !imageSize.height) return;

    setIsProcessing(true);

    try {
      // Convert display coordinates to image coordinates
      const scaleX = imageSize.width / displaySize.width;
      const scaleY = imageSize.height / displaySize.height;

      // Find bounding box of the quadrilateral
      const xs = corners.map((c) => c.x * scaleX);
      const ys = corners.map((c) => c.y * scaleY);

      const minX = Math.max(0, Math.floor(Math.min(...xs)));
      const maxX = Math.min(imageSize.width, Math.ceil(Math.max(...xs)));
      const minY = Math.max(0, Math.floor(Math.min(...ys)));
      const maxY = Math.min(imageSize.height, Math.ceil(Math.max(...ys)));

      const cropWidth = maxX - minX;
      const cropHeight = maxY - minY;

      // Crop the image
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX: minX,
              originY: minY,
              width: cropWidth,
              height: cropHeight,
            },
          },
        ],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );

      onCropComplete(result.uri);
    } catch (error) {
      console.error('Failed to crop image:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Generate polygon points string for SVG
   */
  const polygonPoints = useMemo(() => {
    if (!isInitialized) return '';
    return corners.map((c) => `${c.x},${c.y}`).join(' ');
  }, [corners, isInitialized]);

  /**
   * Calculate zoom bubble position and clipping for the magnified view
   */
  const zoomBubbleData = useMemo(() => {
    if (activeCorner === null || !displaySize.width || !displaySize.height) {
      return null;
    }

    const corner = corners[activeCorner];

    // Position the zoom bubble above the corner
    let bubbleX = corner.x - ZOOM_BUBBLE_SIZE / 2;
    let bubbleY = corner.y - ZOOM_BUBBLE_SIZE - ZOOM_BUBBLE_OFFSET_Y;

    // Keep bubble within screen bounds horizontally
    bubbleX = Math.max(10, Math.min(displaySize.width - ZOOM_BUBBLE_SIZE - 10, bubbleX));

    // If bubble would go above image, position it below the corner instead
    if (bubbleY < 10) {
      bubbleY = corner.y + ZOOM_BUBBLE_OFFSET_Y;
    }

    // Calculate the portion of the image to show in the magnified view
    // The source region in the original display coordinates
    const sourceSize = ZOOM_BUBBLE_SIZE / ZOOM_MAGNIFICATION;
    const sourceX = corner.x - sourceSize / 2;
    const sourceY = corner.y - sourceSize / 2;

    return {
      bubbleX,
      bubbleY,
      cornerX: corner.x,
      cornerY: corner.y,
      sourceX,
      sourceY,
      sourceSize,
    };
  }, [activeCorner, corners, displaySize]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Adjust Crop</Text>
        <Text style={styles.subtitle}>Drag corners to select the spine area</Text>
      </View>

      {/* Image container */}
      <View style={styles.imageWrapper}>
        <View
          style={[
            styles.imageContainer,
            { width: displaySize.width || IMAGE_CONTAINER_WIDTH, height: displaySize.height || IMAGE_CONTAINER_HEIGHT },
          ]}
        >
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            contentFit="contain"
            onLoad={handleImageLoad}
          />

          {/* Crop overlay */}
          {isInitialized && displaySize.width > 0 && (
            <View style={StyleSheet.absoluteFill}>
              <Svg width={displaySize.width} height={displaySize.height}>
                {/* Darkened overlay outside crop area */}
                <Polygon
                  points={`0,0 ${displaySize.width},0 ${displaySize.width},${displaySize.height} 0,${displaySize.height}`}
                  fill="rgba(0,0,0,0.5)"
                  clipRule="evenodd"
                  clipPath="url(#clip)"
                />

                {/* Crop region (semi-transparent) */}
                <Polygon
                  points={polygonPoints}
                  fill="rgba(255,255,255,0.1)"
                  stroke={Colors.accent}
                  strokeWidth={2}
                />

                {/* Grid lines inside crop region */}
                <Line
                  x1={(corners[0].x + corners[1].x) / 2}
                  y1={(corners[0].y + corners[1].y) / 2}
                  x2={(corners[3].x + corners[2].x) / 2}
                  y2={(corners[3].y + corners[2].y) / 2}
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth={1}
                  strokeDasharray="5,5"
                />
                <Line
                  x1={(corners[0].x + corners[3].x) / 2}
                  y1={(corners[0].y + corners[3].y) / 2}
                  x2={(corners[1].x + corners[2].x) / 2}
                  y2={(corners[1].y + corners[2].y) / 2}
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth={1}
                  strokeDasharray="5,5"
                />

                {/* Corner handles */}
                {corners.map((corner, index) => (
                  <Circle
                    key={index}
                    cx={corner.x}
                    cy={corner.y}
                    r={HANDLE_SIZE / 2}
                    fill={activeCorner === index ? Colors.accent : Colors.textInverse}
                    stroke={Colors.accent}
                    strokeWidth={3}
                  />
                ))}
              </Svg>

              {/* Draggable touch targets */}
              {corners.map((corner, index) => (
                <View
                  key={index}
                  {...panResponders[index]?.panHandlers}
                  style={[
                    styles.cornerHandle,
                    {
                      left: corner.x - (HANDLE_SIZE + HANDLE_HIT_SLOP) / 2,
                      top: corner.y - (HANDLE_SIZE + HANDLE_HIT_SLOP) / 2,
                      width: HANDLE_SIZE + HANDLE_HIT_SLOP,
                      height: HANDLE_SIZE + HANDLE_HIT_SLOP,
                    },
                  ]}
                />
              ))}

              {/* Zoom bubble - shows magnified view when dragging a corner */}
              {zoomBubbleData && (
                <View
                  style={[
                    styles.zoomBubble,
                    {
                      left: zoomBubbleData.bubbleX,
                      top: zoomBubbleData.bubbleY,
                      width: ZOOM_BUBBLE_SIZE,
                      height: ZOOM_BUBBLE_SIZE,
                    },
                  ]}
                  pointerEvents="none"
                >
                  <View style={styles.zoomBubbleInner}>
                    <Image
                      source={{ uri: imageUri }}
                      style={{
                        width: displaySize.width * ZOOM_MAGNIFICATION,
                        height: displaySize.height * ZOOM_MAGNIFICATION,
                        position: 'absolute',
                        left: -zoomBubbleData.cornerX * ZOOM_MAGNIFICATION + ZOOM_BUBBLE_SIZE / 2,
                        top: -zoomBubbleData.cornerY * ZOOM_MAGNIFICATION + ZOOM_BUBBLE_SIZE / 2,
                      }}
                      contentFit="contain"
                    />
                    {/* Crosshair to show exact corner position */}
                    <View style={styles.crosshairHorizontal} />
                    <View style={styles.crosshairVertical} />
                    {/* Corner indicator dot */}
                    <View style={styles.zoomCornerDot} />
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <Pressable
          style={[styles.button, styles.cancelButton]}
          onPress={onCancel}
          disabled={isProcessing}
        >
          <Ionicons name="close" size={24} color={Colors.text} />
          <Text style={styles.buttonText}>Cancel</Text>
        </Pressable>

        <Pressable
          style={[styles.button, styles.confirmButton]}
          onPress={handleCrop}
          disabled={isProcessing || !isInitialized}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={Colors.textInverse} />
          ) : (
            <Ionicons name="checkmark" size={24} color={Colors.textInverse} />
          )}
          <Text style={[styles.buttonText, styles.confirmText]}>
            {isProcessing ? 'Processing...' : 'Crop'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  header: {
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  title: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.textInverse,
  },
  subtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textInverse,
    opacity: 0.8,
    marginTop: Spacing.xs,
  },
  imageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  imageContainer: {
    position: 'relative',
    backgroundColor: Colors.primaryDark,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  cornerHandle: {
    position: 'absolute',
    zIndex: 10,
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
  cancelButton: {
    backgroundColor: Colors.textInverse,
  },
  confirmButton: {
    backgroundColor: Colors.success,
  },
  buttonText: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
  },
  confirmText: {
    color: Colors.textInverse,
  },
  // Zoom bubble styles
  zoomBubble: {
    position: 'absolute',
    borderRadius: ZOOM_BUBBLE_SIZE / 2,
    borderWidth: 3,
    borderColor: Colors.accent,
    backgroundColor: Colors.primaryDark,
    overflow: 'hidden',
    zIndex: 100,
    // Add shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },
  zoomBubbleInner: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: ZOOM_BUBBLE_SIZE / 2,
  },
  crosshairHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    marginTop: -0.5,
  },
  crosshairVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    marginLeft: -0.5,
  },
  zoomCornerDot: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
    marginLeft: -4,
    marginTop: -4,
    borderWidth: 1,
    borderColor: Colors.textInverse,
  },
});

export default SpineCropper;
