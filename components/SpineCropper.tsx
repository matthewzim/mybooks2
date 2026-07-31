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
 * - Corner dragging runs entirely on the UI thread (Reanimated shared values +
 *   react-native-gesture-handler), so a drag never waits on a React re-render
 * - Visual crop boundary with darkened surroundings
 * - Defaults to a centered spine-shaped rectangle
 * - Applies a perspective (homography) warp so the quadrilateral is de-skewed
 *   into an upright rectangle (expo-gl), falling back to a bounding-box crop
 *   with expo-image-manipulator if the warp is unavailable
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Image as RNImage,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import {
  Spacing,
  BorderRadius,
  Typography,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import Svg, { Path } from 'react-native-svg';
import {
  warpPerspective,
  isPerspectiveWarpAvailable,
  WarpPoint,
} from '@/utils/perspectiveWarp';

interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
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
const TOUCH_TARGET_SIZE = HANDLE_SIZE + HANDLE_HIT_SLOP;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Zoom bubble configuration
const ZOOM_BUBBLE_SIZE = 120;
const ZOOM_MAGNIFICATION = 2.5;
const ZOOM_BUBBLE_OFFSET_Y = 80; // Distance above the finger

/**
 * Longest edge we keep for the photo we display and crop from.
 *
 * A gallery photo arrives at full camera resolution (commonly 4000px+ on the
 * long edge). Every pixel of that has to be decoded for the preview *and*
 * again, at 2.5x, for the magnifier — which is what made dragging a corner
 * crawl on the "upload a photo" path while camera captures (already cropped to
 * the guide frame, so much smaller) felt fine.
 *
 * Downscaling costs nothing in output quality: the perspective warp caps its
 * own source at the GPU texture limit (2048 on the smallest devices in common
 * use), so it would resize to roughly this size anyway.
 */
const MAX_SOURCE_DIMENSION = 2048;

// Calculate display dimensions for the image preview
const IMAGE_CONTAINER_WIDTH = SCREEN_WIDTH - Spacing.lg * 2;
const IMAGE_CONTAINER_HEIGHT = SCREEN_HEIGHT * 0.6;

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Closed outline of the crop quad, in display coordinates. */
function quadPath(corners: Point[]): string {
  'worklet';
  return (
    `M${corners[0].x} ${corners[0].y}` +
    `L${corners[1].x} ${corners[1].y}` +
    `L${corners[2].x} ${corners[2].y}` +
    `L${corners[3].x} ${corners[3].y}Z`
  );
}

/** Even-odd path that darkens everything outside the crop quadrilateral. */
function outsidePath(corners: Point[], size: Size): string {
  'worklet';
  return `M0 0H${size.width}V${size.height}H0Z ${quadPath(corners)}`;
}

/** The two dashed centre lines inside the crop quad. */
function gridPath(corners: Point[]): string {
  'worklet';
  const topMidX = (corners[0].x + corners[1].x) / 2;
  const topMidY = (corners[0].y + corners[1].y) / 2;
  const bottomMidX = (corners[3].x + corners[2].x) / 2;
  const bottomMidY = (corners[3].y + corners[2].y) / 2;
  const leftMidX = (corners[0].x + corners[3].x) / 2;
  const leftMidY = (corners[0].y + corners[3].y) / 2;
  const rightMidX = (corners[1].x + corners[2].x) / 2;
  const rightMidY = (corners[1].y + corners[2].y) / 2;

  return (
    `M${topMidX} ${topMidY}L${bottomMidX} ${bottomMidY}` +
    `M${leftMidX} ${leftMidY}L${rightMidX} ${rightMidY}`
  );
}

function getImageSize(uri: string): Promise<Size> {
  return new Promise((resolve, reject) => {
    RNImage.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

/**
 * Produce the image the cropper actually shows and crops from: the original
 * when it is already a sane size, otherwise a downscaled copy.
 *
 * Resizing constrains only the longer edge so expo-image-manipulator keeps the
 * aspect ratio itself — passing both dimensions would distort the photo if
 * `RNImage.getSize` reported them without the EXIF rotation applied. Any
 * failure falls back to the original, which is slower to drag but correct.
 */
async function prepareDisplaySource(uri: string): Promise<string> {
  try {
    const { width, height } = await getImageSize(uri);

    if (!width || !height || Math.max(width, height) <= MAX_SOURCE_DIMENSION) {
      return uri;
    }

    const resize =
      width >= height
        ? { width: MAX_SOURCE_DIMENSION }
        : { height: MAX_SOURCE_DIMENSION };

    const result = await ImageManipulator.manipulateAsync(uri, [{ resize }], {
      compress: 0.92,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    return result.uri;
  } catch (error) {
    console.warn('Could not downscale photo for cropping; using the original:', error);
    return uri;
  }
}

export function SpineCropper({
  imageUri,
  initialCrop,
  onCropComplete,
  onCancel,
}: SpineCropperProps) {
  const { colors } = useTheme();
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageSize, setImageSize] = useState<Size>({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState<Size>({ width: 0, height: 0 });
  const [isInitialized, setIsInitialized] = useState(false);

  /**
   * The photo we display and crop from — see `prepareDisplaySource`. Null while
   * it is being prepared, so the image mounts once with its final URI rather
   * than loading the full-resolution original first.
   */
  const [sourceUri, setSourceUri] = useState<string | null>(null);

  /**
   * Corner positions, in display coordinates.
   *
   * The shared value is what the gesture writes and what the overlay and
   * handles render from, so a drag stays on the UI thread. The React copy is
   * committed once per drag (on release) and is what the crop reads.
   */
  const cornersSV = useSharedValue<Point[]>([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ]);
  const [corners, setCorners] = useState<Point[]>(cornersSV.value);
  const activeCornerSV = useSharedValue(-1);
  const boundsSV = useSharedValue<Size>({ width: 0, height: 0 });

  /**
   * Corners are placed once per photo.
   *
   * `onLoad` can fire again for the same image (expo-image reloads whenever it
   * re-resolves its source), and re-running the initial placement then snapped
   * every corner back to where it started — the "the corner bounces back"
   * symptom, which showed up on gallery uploads because a full-resolution photo
   * takes long enough to decode that the reset landed after the drag.
   */
  const cornersPlacedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    cornersPlacedRef.current = false;
    setIsInitialized(false);
    setSourceUri(null);

    prepareDisplaySource(imageUri).then((uri) => {
      if (!cancelled) setSourceUri(uri);
    });

    return () => {
      cancelled = true;
    };
  }, [imageUri]);

  // Stable source objects: a fresh `{ uri }` literal on every render makes
  // expo-image re-resolve (and re-decode) the photo.
  const imageSource = useMemo(
    () => (sourceUri ? { uri: sourceUri } : null),
    [sourceUri]
  );

  /**
   * Size the preview and, the first time the photo loads, place the corners.
   * They default to a centered vertical rectangle (book spine shape).
   */
  const handleImageLoad = useCallback(
    (event: any) => {
      const { width, height } = event.source || { width: 0, height: 0 };

      if (!width || !height) return;

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
      boundsSV.value = { width: displayWidth, height: displayHeight };

      if (cornersPlacedRef.current) return;
      cornersPlacedRef.current = true;

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

      cornersSV.value = initialCorners;
      setCorners(initialCorners);
      setIsInitialized(true);
    },
    [initialCrop, boundsSV, cornersSV]
  );

  /** Called once per drag, when the finger lifts. */
  const commitCorners = useCallback((next: Point[]) => {
    setCorners(next.map((corner) => ({ x: corner.x, y: corner.y })));
  }, []);

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
    if (
      !sourceUri ||
      !imageSize.width ||
      !imageSize.height ||
      !displaySize.width ||
      !displaySize.height
    ) {
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
            imageUri: sourceUri,
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
        sourceUri,
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
   * Overlay geometry.
   *
   * `animatedProps` keeps these in step with the finger without a re-render;
   * the plain `d` props render the committed state, so the overlay is still
   * correct after every drag even on a build where animated SVG props don't
   * take effect.
   */
  const overlayAnimatedProps = useAnimatedProps(() => ({
    d: outsidePath(cornersSV.value, boundsSV.value),
  }));
  const quadAnimatedProps = useAnimatedProps(() => ({
    d: quadPath(cornersSV.value),
  }));
  const gridAnimatedProps = useAnimatedProps(() => ({
    d: gridPath(cornersSV.value),
  }));

  const staticOverlayPath = useMemo(
    () => (isInitialized ? outsidePath(corners, displaySize) : ''),
    [corners, displaySize, isInitialized]
  );
  const staticQuadPath = useMemo(
    () => (isInitialized ? quadPath(corners) : ''),
    [corners, isInitialized]
  );
  const staticGridPath = useMemo(
    () => (isInitialized ? gridPath(corners) : ''),
    [corners, isInitialized]
  );

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
          {imageSource ? (
            <Image
              source={imageSource}
              style={styles.image}
              contentFit="contain"
              transition={0}
              cachePolicy="memory-disk"
              onLoad={handleImageLoad}
            />
          ) : (
            <View style={styles.sourceLoading}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          )}

          {/* Crop overlay */}
          {isInitialized && displaySize.width > 0 && imageSource && (
            <View style={StyleSheet.absoluteFill}>
              <Svg
                width={displaySize.width}
                height={displaySize.height}
                pointerEvents="none"
              >
                {/* Darkened overlay outside crop area */}
                <AnimatedPath
                  d={staticOverlayPath}
                  animatedProps={overlayAnimatedProps}
                  fill={colors.overlay}
                  fillRule="evenodd"
                />

                {/* Crop region boundary */}
                <AnimatedPath
                  d={staticQuadPath}
                  animatedProps={quadAnimatedProps}
                  fill="none"
                  stroke={colors.accent}
                  strokeWidth={2}
                />

                {/* Grid lines inside crop region */}
                <AnimatedPath
                  d={staticGridPath}
                  animatedProps={gridAnimatedProps}
                  fill="none"
                  stroke={colors.textOnDarkMuted}
                  strokeWidth={1}
                  strokeDasharray="5,5"
                />
              </Svg>

              {/* Draggable corner handles */}
              {[0, 1, 2, 3].map((index) => (
                <CornerHandle
                  key={index}
                  index={index}
                  corners={cornersSV}
                  activeCorner={activeCornerSV}
                  bounds={boundsSV}
                  onCommit={commitCorners}
                  accentColor={colors.accent}
                  idleColor={colors.textInverse}
                />
              ))}

              {/* Zoom bubble - shows a magnified view while dragging a corner.
                  It stays mounted (hidden with opacity) rather than being
                  mounted on drag start, so the magnified copy of the photo is
                  decoded while the user is still lining up the first corner
                  instead of after they touch one. */}
              <ZoomBubble
                source={imageSource}
                corners={cornersSV}
                activeCorner={activeCornerSV}
                displaySize={displaySize}
                borderColor={colors.accent}
                backgroundColor={colors.primaryDark}
                crosshairColor={colors.textOnDarkMuted}
                dotBorderColor={colors.textInverse}
              />
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

interface CornerHandleProps {
  index: number;
  corners: SharedValue<Point[]>;
  activeCorner: SharedValue<number>;
  bounds: SharedValue<Size>;
  onCommit: (corners: Point[]) => void;
  accentColor: string;
  idleColor: string;
}

/**
 * One draggable corner.
 *
 * The gesture writes straight into the shared corner list, so the handle, the
 * crop outline and the magnifier all follow the finger on the UI thread. The
 * only React work in a drag is the single commit when the finger lifts.
 */
function CornerHandle({
  index,
  corners,
  activeCorner,
  bounds,
  onCommit,
  accentColor,
  idleColor,
}: CornerHandleProps) {
  const dragStart = useSharedValue<Point>({ x: 0, y: 0 });

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .minDistance(0)
        .onBegin(() => {
          'worklet';
          dragStart.value = corners.value[index];
          activeCorner.value = index;
        })
        .onUpdate((event) => {
          'worklet';
          const { width, height } = bounds.value;
          const x = Math.max(0, Math.min(width, dragStart.value.x + event.translationX));
          const y = Math.max(0, Math.min(height, dragStart.value.y + event.translationY));
          corners.value = corners.value.map((corner, i) =>
            i === index ? { x, y } : corner
          );
        })
        .onFinalize(() => {
          'worklet';
          activeCorner.value = -1;
          runOnJS(onCommit)(corners.value);
        }),
    [index, corners, activeCorner, bounds, dragStart, onCommit]
  );

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: corners.value[index].x - TOUCH_TARGET_SIZE / 2 },
      { translateY: corners.value[index].y - TOUCH_TARGET_SIZE / 2 },
    ],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    backgroundColor: activeCorner.value === index ? accentColor : idleColor,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.cornerHandle, containerStyle]}>
        <Animated.View
          style={[styles.cornerHandleDot, { borderColor: accentColor }, dotStyle]}
        />
      </Animated.View>
    </GestureDetector>
  );
}

interface ZoomBubbleProps {
  source: { uri: string };
  corners: SharedValue<Point[]>;
  activeCorner: SharedValue<number>;
  displaySize: Size;
  borderColor: string;
  backgroundColor: string;
  crosshairColor: string;
  dotBorderColor: string;
}

/**
 * Magnified view of the corner being dragged.
 *
 * Both the bubble and the photo inside it move by transform rather than by
 * `left`/`top`: a layout change would re-lay-out (and make expo-image
 * re-resample) a view 2.5x the size of the preview on every touch event.
 *
 * With no active corner the bubble is parked on the first corner and hidden;
 * it re-positions before it fades in.
 */
function ZoomBubble({
  source,
  corners,
  activeCorner,
  displaySize,
  borderColor,
  backgroundColor,
  crosshairColor,
  dotBorderColor,
}: ZoomBubbleProps) {
  const bubbleStyle = useAnimatedStyle(() => {
    const corner = corners.value[activeCorner.value < 0 ? 0 : activeCorner.value];

    // Position the zoom bubble above the corner, kept within the preview
    let bubbleX = corner.x - ZOOM_BUBBLE_SIZE / 2;
    bubbleX = Math.max(
      10,
      Math.min(displaySize.width - ZOOM_BUBBLE_SIZE - 10, bubbleX)
    );

    // If the bubble would go above the image, put it below the corner instead
    let bubbleY = corner.y - ZOOM_BUBBLE_SIZE - ZOOM_BUBBLE_OFFSET_Y;
    if (bubbleY < 10) {
      bubbleY = corner.y + ZOOM_BUBBLE_OFFSET_Y;
    }

    return {
      opacity: activeCorner.value < 0 ? 0 : 1,
      transform: [{ translateX: bubbleX }, { translateY: bubbleY }],
    };
  });

  // Slide the magnified photo so the active corner sits under the crosshair
  const magnifiedStyle = useAnimatedStyle(() => {
    const corner = corners.value[activeCorner.value < 0 ? 0 : activeCorner.value];

    return {
      transform: [
        { translateX: -corner.x * ZOOM_MAGNIFICATION + ZOOM_BUBBLE_SIZE / 2 },
        { translateY: -corner.y * ZOOM_MAGNIFICATION + ZOOM_BUBBLE_SIZE / 2 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.zoomBubble,
        {
          width: ZOOM_BUBBLE_SIZE,
          height: ZOOM_BUBBLE_SIZE,
          borderColor,
          backgroundColor,
        },
        bubbleStyle,
      ]}
      pointerEvents="none"
    >
      <View style={styles.zoomBubbleInner}>
        <Animated.View
          style={[
            styles.magnifiedImage,
            {
              width: displaySize.width * ZOOM_MAGNIFICATION,
              height: displaySize.height * ZOOM_MAGNIFICATION,
            },
            magnifiedStyle,
          ]}
        >
          <Image
            source={source}
            style={styles.image}
            contentFit="contain"
            // No fade-in, and keep the decoded copy around so
            // re-grabbing a corner never re-decodes the photo.
            transition={0}
            cachePolicy="memory-disk"
            priority="high"
          />
        </Animated.View>
        {/* Crosshair to show exact corner position */}
        <View style={[styles.crosshairHorizontal, { backgroundColor: crosshairColor }]} />
        <View style={[styles.crosshairVertical, { backgroundColor: crosshairColor }]} />
        {/* Corner indicator dot */}
        <View style={[styles.zoomCornerDot, { backgroundColor: borderColor, borderColor: dotBorderColor }]} />
      </View>
    </Animated.View>
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
  sourceLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerHandle: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: TOUCH_TARGET_SIZE,
    height: TOUCH_TARGET_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  cornerHandleDot: {
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    borderWidth: 3,
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
    left: 0,
    top: 0,
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
  magnifiedImage: {
    position: 'absolute',
    left: 0,
    top: 0,
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
