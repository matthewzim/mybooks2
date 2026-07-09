/**
 * SpineCropper Component
 *
 * Allows users to adjust a rectangular crop region on a captured image
 * via 4 corner handles. Designed for cropping book spines from photos.
 *
 * Features:
 * - Displays captured image
 * - 4 independently draggable corner handles forming an arbitrary
 *   quadrilateral, so the selection can follow a spine photographed at an angle
 * - Visual crop boundary with darkened surroundings
 * - Defaults to a centered spine-shaped rectangle
 * - Applies a perspective (homography) warp so the quadrilateral is de-skewed
 *   into an upright rectangle (expo-gl), falling back to a bounding-box crop
 *   with expo-image-manipulator if the warp is unavailable
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
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
  Spacing,
  BorderRadius,
  Typography,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import Svg, { Polygon, Circle, Line, Path } from 'react-native-svg';
import {
  warpPerspective,
  isPerspectiveWarpAvailable,
  WarpPoint,
} from '@/utils/perspectiveWarp';

interface Point {
  x: number;
  y: number;
}

/**
 * The chosen crop region, normalized to 0..1 relative to the image dimensions.
 * `x/y/width/height` are the quad's bounding box (kept for compatibility and
 * the fallback crop); `corners` are the four quad corners (TL, TR, BR, BL) so a
 * later "Adjust Crop" can restore the exact quad the user drew.
 */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
  corners?: Point[];
}

interface SpineCropperProps {
  imageUri: string;
  /** Restores a previously chosen crop region (e.g. when re-adjusting) */
  initialCrop?: CropRect;
  onCropComplete: (croppedUri: string, cropRect: CropRect) => void;
  onCancel: () => void;
}

const HANDLE_SIZE = 30;
const HANDLE_HIT_SLOP = 20;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Zoom bubble configuration
const ZOOM_BUBBLE_SIZE = 120;
const ZOOM_MAGNIFICATION = 2.5;
const ZOOM_BUBBLE_OFFSET_Y = 80; // Distance above the finger

// Calculate display dimensions for the image preview
const IMAGE_CONTAINER_WIDTH = SCREEN_WIDTH - Spacing.lg * 2;
const IMAGE_CONTAINER_HEIGHT = SCREEN_HEIGHT * 0.6;

export function SpineCropper({
  imageUri,
  initialCrop,
  onCropComplete,
  onCancel,
}: SpineCropperProps) {
  const { colors } = useTheme();
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

  // Ref to track current corners for synchronous access in gesture handlers
  const cornersRef = useRef<Point[]>(corners);
  cornersRef.current = corners;

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

      let initialCorners: Point[];

      if (initialCrop?.corners && initialCrop.corners.length === 4) {
        // Restore the exact quad the user drew last time.
        initialCorners = initialCrop.corners.map((c) => ({
          x: Math.max(0, Math.min(displayWidth, c.x * displayWidth)),
          y: Math.max(0, Math.min(displayHeight, c.y * displayHeight)),
        }));
      } else {
        let left: number;
        let top: number;
        let right: number;
        let bottom: number;

        if (initialCrop) {
          // Restore from a bounding-box-only crop region.
          left = Math.max(0, initialCrop.x * displayWidth);
          top = Math.max(0, initialCrop.y * displayHeight);
          right = Math.min(displayWidth, (initialCrop.x + initialCrop.width) * displayWidth);
          bottom = Math.min(displayHeight, (initialCrop.y + initialCrop.height) * displayHeight);
        } else {
          // Initialize crop region as centered vertical rectangle
          // Typical book spine aspect ratio is about 1:3 to 1:4
          const spineWidth = displayWidth * 0.3;
          const spineHeight = displayHeight * 0.85;
          left = (displayWidth - spineWidth) / 2;
          top = (displayHeight - spineHeight) / 2;
          right = left + spineWidth;
          bottom = top + spineHeight;
        }

        initialCorners = [
          { x: left, y: top }, // top-left
          { x: right, y: top }, // top-right
          { x: right, y: bottom }, // bottom-right
          { x: left, y: bottom }, // bottom-left
        ];
      }

      setCorners(initialCorners);
      setIsInitialized(true);
    }
  }, [initialCrop]);

  /**
   * Handle corner drag.
   *
   * Each corner moves independently of the others, so the selection can be any
   * quadrilateral. handleCrop then perspective-warps that quad into an upright
   * rectangle, so every corner is honored exactly where the user placed it.
   */
  const createPanResponder = useCallback((cornerIndex: number) => {
    let initialCornerPosition: Point | null = null;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Store the initial corner position synchronously when drag starts
        // Using ref ensures we get the current value without async state callback
        initialCornerPosition = { ...cornersRef.current[cornerIndex] };
        setActiveCorner(cornerIndex);
      },
      onPanResponderMove: (
        _event: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        if (!initialCornerPosition) return;

        // Capture position values before async setCorners to avoid race condition
        // where onPanResponderRelease sets initialCornerPosition to null
        const initialX = initialCornerPosition.x;
        const initialY = initialCornerPosition.y;

        setCorners((prev) => {
          const newCorners = [...prev];
          const newX = Math.max(0, Math.min(displaySize.width, initialX + gestureState.dx));
          const newY = Math.max(0, Math.min(displaySize.height, initialY + gestureState.dy));
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
   * Apply the crop.
   *
   * The four corners define an arbitrary quadrilateral. The preferred path
   * perspective-warps that quad into an upright rectangle (so a spine shot at
   * an angle is de-skewed); if the GL warp is unavailable it falls back to a
   * plain bounding-box crop. Either way the quad corners are saved so a later
   * "Adjust Crop" restores exactly what the user drew.
   */
  const handleCrop = async () => {
    if (!imageSize.width || !imageSize.height || !displaySize.width || !displaySize.height) {
      return;
    }

    setIsProcessing(true);

    try {
      // Convert display coordinates to image pixel coordinates (TL, TR, BR, BL).
      const scaleX = imageSize.width / displaySize.width;
      const scaleY = imageSize.height / displaySize.height;
      const imageCorners = corners.map((c) => ({
        x: Math.max(0, Math.min(imageSize.width, c.x * scaleX)),
        y: Math.max(0, Math.min(imageSize.height, c.y * scaleY)),
      })) as [WarpPoint, WarpPoint, WarpPoint, WarpPoint];

      // Bounding box of the quad — used for the fallback crop and stored on the
      // returned CropRect.
      const xs = imageCorners.map((c) => c.x);
      const ys = imageCorners.map((c) => c.y);
      const minX = Math.max(0, Math.floor(Math.min(...xs)));
      const maxX = Math.min(imageSize.width, Math.ceil(Math.max(...xs)));
      const minY = Math.max(0, Math.floor(Math.min(...ys)));
      const maxY = Math.min(imageSize.height, Math.ceil(Math.max(...ys)));
      const boundWidth = maxX - minX;
      const boundHeight = maxY - minY;

      if (boundWidth < 1 || boundHeight < 1) return;

      const cropRect: CropRect = {
        x: minX / imageSize.width,
        y: minY / imageSize.height,
        width: boundWidth / imageSize.width,
        height: boundHeight / imageSize.height,
        // Normalized to the display (== image) box so it restores on re-adjust.
        corners: corners.map((c) => ({
          x: c.x / displaySize.width,
          y: c.y / displaySize.height,
        })),
      };

      // Preferred: perspective-warp the quad into an upright rectangle. Only
      // attempt this when expo-gl's native module is present in the build;
      // otherwise skip straight to the crop so we don't log a failed-warp
      // warning on every crop.
      if (isPerspectiveWarpAvailable()) {
        try {
          const warpedUri = await warpPerspective({
            imageUri,
            imageWidth: imageSize.width,
            imageHeight: imageSize.height,
            corners: imageCorners,
          });
          onCropComplete(warpedUri, cropRect);
          return;
        } catch (warpError) {
          console.warn('Perspective warp failed; falling back to crop:', warpError);
        }
      }

      // Fallback: plain bounding-box crop.
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX: minX,
              originY: minY,
              width: boundWidth,
              height: boundHeight,
            },
          },
        ],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );

      onCropComplete(result.uri, cropRect);
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
   * Even-odd path that darkens everything outside the crop quadrilateral
   */
  const outsideOverlayPath = useMemo(() => {
    if (!isInitialized || !displaySize.width || !displaySize.height) return '';
    const quad = corners
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x} ${c.y}`)
      .join('');
    return (
      `M0 0H${displaySize.width}V${displaySize.height}H0Z ` +
      `${quad}Z`
    );
  }, [corners, displaySize, isInitialized]);

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
    <View style={[styles.container, { backgroundColor: colors.primary }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textInverse }]}>Adjust Crop</Text>
        <Text style={[styles.subtitle, { color: colors.textInverse }]}>Drag corners to select the spine area</Text>
      </View>

      {/* Image container */}
      <View style={styles.imageWrapper}>
        <View
          style={[
            styles.imageContainer,
            { width: displaySize.width || IMAGE_CONTAINER_WIDTH, height: displaySize.height || IMAGE_CONTAINER_HEIGHT, backgroundColor: colors.primaryDark },
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
                <Path
                  d={outsideOverlayPath}
                  fill={colors.overlay}
                  fillRule="evenodd"
                />

                {/* Crop region boundary */}
                <Polygon
                  points={polygonPoints}
                  fill="none"
                  stroke={colors.accent}
                  strokeWidth={2}
                />

                {/* Grid lines inside crop region */}
                <Line
                  x1={(corners[0].x + corners[1].x) / 2}
                  y1={(corners[0].y + corners[1].y) / 2}
                  x2={(corners[3].x + corners[2].x) / 2}
                  y2={(corners[3].y + corners[2].y) / 2}
                  stroke={colors.textOnDarkMuted}
                  strokeWidth={1}
                  strokeDasharray="5,5"
                />
                <Line
                  x1={(corners[0].x + corners[3].x) / 2}
                  y1={(corners[0].y + corners[3].y) / 2}
                  x2={(corners[1].x + corners[2].x) / 2}
                  y2={(corners[1].y + corners[2].y) / 2}
                  stroke={colors.textOnDarkMuted}
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
                    fill={activeCorner === index ? colors.accent : colors.textInverse}
                    stroke={colors.accent}
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
                      borderColor: colors.accent,
                      backgroundColor: colors.primaryDark,
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
                    <View style={[styles.crosshairHorizontal, { backgroundColor: colors.textOnDarkMuted }]} />
                    <View style={[styles.crosshairVertical, { backgroundColor: colors.textOnDarkMuted }]} />
                    {/* Corner indicator dot */}
                    <View style={[styles.zoomCornerDot, { backgroundColor: colors.accent, borderColor: colors.textInverse }]} />
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
          style={[styles.button, styles.cancelButton, { backgroundColor: colors.textInverse }]}
          onPress={onCancel}
          disabled={isProcessing}
        >
          <Ionicons name="close" size={24} color={colors.text} />
          <Text style={[styles.buttonText, { color: colors.text }]}>Cancel</Text>
        </Pressable>

        <Pressable
          style={[styles.button, styles.confirmButton, { backgroundColor: colors.success }]}
          onPress={handleCrop}
          disabled={isProcessing || !isInitialized}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Ionicons name="checkmark" size={24} color={colors.textInverse} />
          )}
          <Text style={[styles.buttonText, { color: colors.textInverse }]}>
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
  imageContainer: {
    position: 'relative',
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
  cancelButton: {},
  confirmButton: {},
  buttonText: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  confirmText: {},
  // Zoom bubble styles
  zoomBubble: {
    position: 'absolute',
    borderRadius: ZOOM_BUBBLE_SIZE / 2,
    borderWidth: 3,
    overflow: 'hidden',
    zIndex: 100,
    // Add shadow for depth
    shadowColor: '#4a2f19',
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
    marginTop: -0.5,
  },
  crosshairVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 1,
    marginLeft: -0.5,
  },
  zoomCornerDot: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: -4,
    marginTop: -4,
    borderWidth: 1,
  },
});

export default SpineCropper;
