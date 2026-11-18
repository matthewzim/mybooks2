/**
 * Book3D Component
 *
 * A tapped book lifted off the shelf as a 3D object. The book slides up out
 * of its slot, flies to the top of the screen while turning from its spine to
 * its front cover, and can then be spun around (drag), zoomed (pinch) and
 * flipped over (tap). `putBack` reverses the flight and slides it back into
 * its slot.
 *
 * The book is a box built from six views (front, back, spine, fore-edge, top
 * and bottom page edges), each placed in 3D with React Native transforms. RN
 * has no depth buffer or `preserve-3d`, so every face is transformed on its
 * own and hidden when it faces away from the camera; a box is convex, so the
 * faces left showing never overlap and no depth sorting is needed. Each face
 * is also shaded from its angle to a fixed light so the box reads as solid.
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SpineArt } from '@/components/BookSpine';
import {
  FIXED_GEOMETRY_MAX_FONT_SCALE,
  getSerifFontFamily,
  serifItalicStyle,
} from '@/constants/theme';
import { getSpineCloth } from '@/utils/spineCloth';
import type { BookOrigin } from '@/utils/bookOrigin';
import type { Book } from '@/types';

/** Distance from the camera to the book's centre, in points */
const PERSPECTIVE = 1100;

/** Resting pose: front cover turned slightly so the spine shows on the left */
const REST_RX = 10;
const REST_RY = 22;
/** Resting pose when flipped over to the back cover */
const BACK_RY = 180 - REST_RY;
/** Spine facing the camera, as the book stands on the shelf */
const SPINE_RY = 90;
/** Tilt while sliding out of the slot, so the top page edge shows */
const LIFT_RX = -14;

const LIFT_MS = 230;
const FLY_MS = 620;
const RETURN_FLY_MS = 520;
const RETURN_DROP_MS = 210;

const DEFAULT_COVER_ASPECT = 0.67;
const DEFAULT_THICKNESS_RATIO = 0.13;
/** Shelf spine height assumed when the tap position is unknown */
const FALLBACK_SPINE_HEIGHT = 180;

/** Light from the upper left, in front of the book (y points down) */
const LIGHT = (() => {
  const v = [-0.35, -0.5, 1];
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len] as const;
})();

const FLY_EASING = Easing.bezier(0.33, 0, 0.2, 1);

type FaceKind = 'front' | 'back' | 'spine' | 'fore' | 'top' | 'bottom';
type Vec3 = [number, number, number];

/**
 * How each face is placed: rotated by (px, py) degrees from facing the
 * camera, then pushed out along its own normal to the side of the box.
 */
const FACE_SPECS: Record<FaceKind, { px: number; py: number; normal: Vec3 }> = {
  front: { px: 0, py: 0, normal: [0, 0, 1] },
  back: { px: 0, py: 180, normal: [0, 0, -1] },
  // Spine on the left of the front cover, as on a shelf-read English book
  spine: { px: 0, py: -90, normal: [-1, 0, 0] },
  fore: { px: 0, py: 90, normal: [1, 0, 0] },
  top: { px: 90, py: 0, normal: [0, -1, 0] },
  bottom: { px: -90, py: 0, normal: [0, 1, 0] },
};

/** Face size and distance from the book's centre for a W×H×D book */
function faceGeometry(kind: FaceKind, w: number, h: number, d: number) {
  'worklet';
  switch (kind) {
    case 'front':
    case 'back':
      return { width: w, height: h, offset: d / 2 };
    case 'spine':
    case 'fore':
      return { width: d, height: h, offset: w / 2 };
    default:
      return { width: w, height: d, offset: h / 2 };
  }
}

/**
 * Rotate a vector the way the face transforms do: rotateY first, then
 * rotateX (matching RN/CSS rotation matrices, with +z toward the camera).
 */
function rotate(v: Vec3, rxDeg: number, ryDeg: number): Vec3 {
  'worklet';
  const a = (ryDeg * Math.PI) / 180;
  const x1 = v[0] * Math.cos(a) + v[2] * Math.sin(a);
  const z1 = -v[0] * Math.sin(a) + v[2] * Math.cos(a);
  const b = (rxDeg * Math.PI) / 180;
  const y2 = v[1] * Math.cos(b) - z1 * Math.sin(b);
  const z2 = v[1] * Math.sin(b) + z1 * Math.cos(b);
  return [x1, y2, z2];
}

/** Nearest resting angle (front or back cover) to a free-spinning `ry` */
function nearestRestRy(ry: number): number {
  'worklet';
  const base = Math.floor(ry / 360) * 360;
  let best = base + REST_RY;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let turn = -1; turn <= 1; turn++) {
    const front = base + turn * 360 + REST_RY;
    const back = base + turn * 360 + BACK_RY;
    if (Math.abs(front - ry) < bestDistance) {
      bestDistance = Math.abs(front - ry);
      best = front;
    }
    if (Math.abs(back - ry) < bestDistance) {
      bestDistance = Math.abs(back - ry);
      best = back;
    }
  }
  return best;
}

/** Spine-forward angle closest to `ry`, so putting back never over-spins */
function nearestSpineRy(ry: number): number {
  'worklet';
  return SPINE_RY + Math.round((ry - SPINE_RY) / 360) * 360;
}

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/** Horizontal page lines for a page-edge face, as gradient stops */
function pageStripes(count: number) {
  const colors: string[] = [];
  const locations: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = i / count;
    const line = start + 0.55 / count;
    colors.push('rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0)', 'rgba(120, 96, 62, 0.16)');
    locations.push(start, line, Math.min(1, line + 0.001));
  }
  colors.push('rgba(120, 96, 62, 0.16)');
  locations.push(1);
  return {
    colors: colors as unknown as readonly [string, string, ...string[]],
    locations: locations as unknown as readonly [number, number, ...number[]],
  };
}

const PAGE_STRIPES = pageStripes(22);

export interface Book3DStage {
  /** Window-space box the resting book is centred in */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Book3DHandle {
  /**
   * Fly the book back into its slot on the shelf (or fade it away when
   * `vanish` is set, e.g. after the book was deleted), then call `onDone`.
   */
  putBack: (onDone: () => void, options?: { vanish?: boolean }) => void;
}

interface Book3DProps {
  book: Book;
  coverImageUrl: string | null;
  isCoverLoading?: boolean;
  /** Where the book sat on the shelf; without it the book fades in */
  origin?: BookOrigin | null;
  stage: Book3DStage;
  /** Fade the book out of the way (e.g. while the details sheet is editing) */
  dimmed?: boolean;
  /** The book has left the shelf: hide its spine there */
  onLifted?: () => void;
}

export const Book3D = forwardRef<Book3DHandle, Book3DProps>(function Book3D(
  { book, coverImageUrl, isCoverLoading = false, origin, stage, dimmed = false, onLifted },
  ref
) {
  const reduceMotion = useReducedMotion();
  const cloth = getSpineCloth(book.title);
  const displayTitle = book.title?.trim() || 'Untitled';
  const displayAuthor = book.author?.trim() || 'Unknown Author';

  // ---- Geometry -----------------------------------------------------------
  // Book height is fixed for the life of the viewer (the flight is computed
  // from it); the cover width follows the cover image's aspect once known.
  const bookHeight = useMemo(
    () => Math.max(120, Math.min(stage.height * 0.84, 400, (stage.width * 0.64) / 0.75)),
    [stage.height, stage.width]
  );
  const shelfSpineHeight = origin
    ? origin.flat
      ? origin.width
      : origin.height
    : FALLBACK_SPINE_HEIGHT;
  const shelfSpineThickness = origin ? (origin.flat ? origin.height : origin.width) : 0;
  const thickness =
    bookHeight *
    (origin
      ? clamp(shelfSpineThickness / shelfSpineHeight, 0.06, 0.3)
      : DEFAULT_THICKNESS_RATIO);
  // The spine face is drawn at shelf size and scaled up, so it is an exact,
  // magnified copy of the spine the user tapped.
  const spineArtScale = bookHeight / shelfSpineHeight;
  const box = bookHeight;
  const centerX = stage.x + stage.width / 2;
  const centerY = stage.y + stage.height / 2;

  /**
   * The shelf pose: where, how big and how turned the book starts and ends,
   * relative to its resting place on the stage. `null` when the shelf
   * position is unknown.
   */
  const computeShelfPose = useCallback(
    (coverWidthNow: number) => {
      if (!origin) return null;
      // The spine face sits half a cover-width nearer the camera than the
      // book's centre, which perspective magnifies; undo that so the spine
      // lands exactly on the slot it came from.
      const magnification = PERSPECTIVE / (PERSPECTIVE - coverWidthNow / 2);
      const lift = origin.flat ? Math.max(origin.height * 1.2, 24) : origin.height * 0.35;
      return {
        x: origin.x + origin.width / 2 - centerX,
        y: origin.y + origin.height / 2 - centerY,
        lift,
        scale: shelfSpineHeight / (bookHeight * magnification),
        rotateZ: origin.flat ? -90 : 0,
      };
    },
    [origin, centerX, centerY, shelfSpineHeight, bookHeight]
  );

  // Start on top of the shelf spine (invisible until the spine art is drawn,
  // so the hand-off from shelf to 3D book doesn't flash a placeholder).
  const [initial] = useState(() => {
    const pose = computeShelfPose(bookHeight * DEFAULT_COVER_ASPECT);
    if (pose && !reduceMotion) {
      return { x: pose.x, y: pose.y, scale: pose.scale, rotateZ: pose.rotateZ, rx: 0, ry: SPINE_RY };
    }
    return {
      x: 0,
      y: 0,
      scale: reduceMotion ? 1 : 0.6,
      rotateZ: 0,
      rx: REST_RX,
      ry: reduceMotion ? REST_RY : SPINE_RY,
    };
  });

  // ---- Animated state -------------------------------------------------------
  const coverWidth = useSharedValue(bookHeight * DEFAULT_COVER_ASPECT);
  const rx = useSharedValue(initial.rx);
  const ry = useSharedValue(initial.ry);
  const translateX = useSharedValue(initial.x);
  const translateY = useSharedValue(initial.y);
  const scale = useSharedValue(initial.scale);
  const rotateZ = useSharedValue(initial.rotateZ);
  const zoom = useSharedValue(1);
  const opacity = useSharedValue(0);
  const dimOpacity = useSharedValue(1);
  const gestureStartRx = useSharedValue(0);
  const gestureStartRy = useSharedValue(0);
  const gestureStartZoom = useSharedValue(1);

  const [isReady, setIsReady] = useState(false);
  const [isInteractive, setIsInteractive] = useState(false);
  const hasOpenedRef = useRef(false);
  const onLiftedRef = useRef(onLifted);
  useEffect(() => {
    onLiftedRef.current = onLifted;
  }, [onLifted]);

  const markReady = useCallback(() => setIsReady(true), []);

  // Don't wait forever on a spine image that never arrives
  useEffect(() => {
    const timer = setTimeout(markReady, 350);
    return () => clearTimeout(timer);
  }, [markReady]);

  // ---- Opening flight -------------------------------------------------------
  useEffect(() => {
    if (!isReady || hasOpenedRef.current) return;
    hasOpenedRef.current = true;

    const enableInteraction = () => setIsInteractive(true);
    const pose = computeShelfPose(coverWidth.value);

    if (reduceMotion) {
      opacity.value = withTiming(1, { duration: 200 }, (finished) => {
        if (finished) runOnJS(enableInteraction)();
      });
      onLiftedRef.current?.();
      return;
    }

    if (!pose) {
      // Opened without a known shelf position: turn in from the spine
      opacity.value = withTiming(1, { duration: 220 });
      scale.value = withTiming(1, { duration: FLY_MS, easing: FLY_EASING });
      ry.value = withTiming(REST_RY, { duration: FLY_MS, easing: FLY_EASING }, (finished) => {
        if (finished) runOnJS(enableInteraction)();
      });
      onLiftedRef.current?.();
      return;
    }

    opacity.value = 1;
    onLiftedRef.current?.();

    const lift = { duration: LIFT_MS, easing: Easing.out(Easing.cubic) };
    const fly = { duration: FLY_MS, easing: FLY_EASING };

    // 1. Slide up out of the slot, tipping back to show the top edge
    // 2. Fly to the stage, growing and turning from spine to cover
    translateY.value = withSequence(withTiming(pose.y - pose.lift, lift), withTiming(0, fly));
    rx.value = withSequence(withTiming(LIFT_RX, lift), withTiming(REST_RX, fly));
    translateX.value = withDelay(LIFT_MS, withTiming(0, fly));
    scale.value = withDelay(LIFT_MS, withTiming(1, fly));
    rotateZ.value = withDelay(LIFT_MS, withTiming(0, fly));
    ry.value = withDelay(
      LIFT_MS,
      withTiming(REST_RY, { duration: FLY_MS + 60, easing: FLY_EASING }, (finished) => {
        if (finished) runOnJS(enableInteraction)();
      })
    );
  }, [
    isReady,
    reduceMotion,
    computeShelfPose,
    coverWidth,
    opacity,
    translateX,
    translateY,
    scale,
    rotateZ,
    rx,
    ry,
  ]);

  // Fade out of the way while the details sheet covers the stage
  useEffect(() => {
    dimOpacity.value = withTiming(dimmed ? 0 : 1, { duration: 200 });
  }, [dimmed, dimOpacity]);

  // ---- Putting the book back --------------------------------------------------
  useImperativeHandle(
    ref,
    () => ({
      putBack: (onDone, options) => {
        setIsInteractive(false);
        const all = [rx, ry, translateX, translateY, scale, rotateZ, zoom, opacity];
        all.forEach((value) => cancelAnimation(value));

        const pose = computeShelfPose(coverWidth.value);
        if (options?.vanish || !pose || reduceMotion || !hasOpenedRef.current) {
          scale.value = withTiming(scale.value * 0.85, { duration: 220 });
          opacity.value = withTiming(0, { duration: 220 }, () => {
            runOnJS(onDone)();
          });
          return;
        }

        const fly = { duration: RETURN_FLY_MS, easing: FLY_EASING };
        const drop = { duration: RETURN_DROP_MS, easing: Easing.inOut(Easing.quad) };

        zoom.value = withTiming(1, fly);
        ry.value = withTiming(nearestSpineRy(ry.value), fly);
        rx.value = withSequence(withTiming(LIFT_RX, fly), withTiming(0, drop));
        translateX.value = withTiming(pose.x, fly);
        scale.value = withTiming(pose.scale, fly);
        rotateZ.value = withTiming(pose.rotateZ, fly);
        translateY.value = withSequence(
          withTiming(pose.y - pose.lift, fly),
          withTiming(pose.y, drop, () => {
            runOnJS(onDone)();
          })
        );
      },
    }),
    [
      computeShelfPose,
      coverWidth,
      reduceMotion,
      rx,
      ry,
      translateX,
      translateY,
      scale,
      rotateZ,
      zoom,
      opacity,
    ]
  );

  // ---- Gestures -----------------------------------------------------------------
  const pan = Gesture.Pan()
    .enabled(isInteractive)
    .onStart(() => {
      cancelAnimation(rx);
      cancelAnimation(ry);
      gestureStartRx.value = rx.value;
      gestureStartRy.value = ry.value;
    })
    .onUpdate((event) => {
      ry.value = gestureStartRy.value + event.translationX * 0.55;
      rx.value = clamp(gestureStartRx.value - event.translationY * 0.35, -55, 55);
    })
    .onEnd((event) => {
      // Let a flick carry the spin on, then settle on whichever cover is
      // nearest to where it would come to rest.
      const velocity = event.velocityX * 0.55;
      const target = nearestRestRy(ry.value + velocity * 0.12);
      ry.value = withSpring(target, { velocity, damping: 20, stiffness: 110, mass: 1 });
      rx.value = withSpring(REST_RX, { damping: 18, stiffness: 140 });
    });

  const pinch = Gesture.Pinch()
    .enabled(isInteractive)
    .onStart(() => {
      gestureStartZoom.value = zoom.value;
    })
    .onUpdate((event) => {
      zoom.value = clamp(gestureStartZoom.value * event.scale, 0.75, 1.6);
    })
    .onEnd(() => {
      zoom.value = withSpring(1, { damping: 16, stiffness: 160 });
    });

  // Tap flips the book over to the other cover
  const tap = Gesture.Tap()
    .enabled(isInteractive)
    .onEnd((_event, success) => {
      if (!success) return;
      ry.value = withSpring(nearestRestRy(ry.value + 180), { damping: 18, stiffness: 120 });
      rx.value = withSpring(REST_RX, { damping: 18, stiffness: 140 });
    });

  const gesture = Gesture.Race(Gesture.Simultaneous(pan, pinch), tap);

  // ---- Styles -------------------------------------------------------------------
  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value * dimOpacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotateZ.value}deg` },
      { scale: scale.value * zoom.value },
    ],
  }));

  const touchAreaStyle = useAnimatedStyle(() => ({
    width: coverWidth.value + 32,
    left: (box - coverWidth.value - 32) / 2,
  }));

  const handleCoverLoad = useCallback(
    (event: { source: { width: number; height: number } }) => {
      const { width, height } = event.source;
      if (!width || !height) return;
      const aspect = clamp(width / height, 0.55, 0.85);
      coverWidth.value = hasOpenedRef.current
        ? withTiming(bookHeight * aspect, { duration: 220 })
        : bookHeight * aspect;
    },
    [bookHeight, coverWidth]
  );

  const faceProps = { box, bookHeight, thickness, coverWidth, rx, ry };

  return (
    <Animated.View
      style={[
        styles.stage,
        { left: centerX - box / 2, top: centerY - box / 2, width: box, height: box },
        containerStyle,
      ]}
      pointerEvents={dimmed ? 'none' : 'box-none'}
    >
      {/* Back cover: the front art blurred, with the title set on it */}
      <Face kind="back" {...faceProps}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: cloth.color }]} />
        {coverImageUrl ? (
          <Image
            source={{ uri: coverImageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={28}
            cachePolicy="memory-disk"
          />
        ) : null}
        <View style={[StyleSheet.absoluteFill, styles.backScrim]} />
        <View style={styles.backText}>
          <Text
            style={styles.backTitle}
            numberOfLines={3}
            maxFontSizeMultiplier={FIXED_GEOMETRY_MAX_FONT_SCALE}
          >
            {displayTitle}
          </Text>
          <Text
            style={styles.backAuthor}
            numberOfLines={1}
            maxFontSizeMultiplier={FIXED_GEOMETRY_MAX_FONT_SCALE}
          >
            {displayAuthor}
          </Text>
        </View>
      </Face>

      <Face kind="top" {...faceProps}>
        <PageEdge direction="horizontal" />
      </Face>
      <Face kind="bottom" {...faceProps}>
        <PageEdge direction="horizontal" />
      </Face>
      <Face kind="fore" {...faceProps}>
        <PageEdge direction="vertical" />
      </Face>

      <Face kind="spine" {...faceProps}>
        <View
          style={{
            position: 'absolute',
            width: thickness / spineArtScale,
            height: shelfSpineHeight,
            left: (thickness - thickness / spineArtScale) / 2,
            top: (bookHeight - shelfSpineHeight) / 2,
            transform: [{ scale: spineArtScale }],
          }}
        >
          <SpineArt
            book={book}
            height={shelfSpineHeight}
            showLoading={false}
            onReady={markReady}
          />
        </View>
      </Face>

      <Face kind="front" {...faceProps} gloss>
        {coverImageUrl ? (
          <Image
            source={{ uri: coverImageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            onLoad={handleCoverLoad}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.clothCover, { backgroundColor: cloth.color }]}>
            <View style={[styles.coverFrame, { borderColor: cloth.bandColor }]} />
            <Text
              style={[styles.clothTitle, { color: cloth.titleColor }]}
              numberOfLines={4}
              maxFontSizeMultiplier={FIXED_GEOMETRY_MAX_FONT_SCALE}
            >
              {displayTitle}
            </Text>
            <Text
              style={[styles.clothAuthor, { color: cloth.titleColor }]}
              numberOfLines={2}
              maxFontSizeMultiplier={FIXED_GEOMETRY_MAX_FONT_SCALE}
            >
              {displayAuthor}
            </Text>
            {isCoverLoading && (
              <ActivityIndicator style={styles.coverSpinner} size="small" color={cloth.titleColor} />
            )}
          </View>
        )}
        {/* Hinge crease where the cover board meets the spine */}
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.3)', 'rgba(255, 255, 255, 0.16)', 'rgba(0, 0, 0, 0.12)', 'rgba(0, 0, 0, 0)']}
          locations={[0, 0.35, 0.7, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.hinge}
          pointerEvents="none"
        />
      </Face>

      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[styles.touchArea, { top: -16, height: bookHeight + 32 }, touchAreaStyle]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${displayTitle} by ${displayAuthor}`}
          accessibilityHint="Drag to turn the book, tap to flip it over"
        />
      </GestureDetector>
    </Animated.View>
  );
});

interface FaceProps {
  kind: FaceKind;
  box: number;
  bookHeight: number;
  thickness: number;
  coverWidth: SharedValue<number>;
  rx: SharedValue<number>;
  ry: SharedValue<number>;
  /** Moving sheen as the cover turns toward the light */
  gloss?: boolean;
  children: React.ReactNode;
}

/** One side of the book, placed, culled and shaded in 3D */
function Face({ kind, box, bookHeight, thickness, coverWidth, rx, ry, gloss, children }: FaceProps) {
  const spec = FACE_SPECS[kind];
  const radius = kind === 'front' || kind === 'back' ? styles.coverRadius : null;

  const faceStyle = useAnimatedStyle(() => {
    const geometry = faceGeometry(kind, coverWidth.value, bookHeight, thickness);
    const normal = rotate(spec.normal, rx.value, ry.value);
    // The face centre is its normal times its offset, so it faces the camera
    // at (0, 0, PERSPECTIVE) when normal · (camera − centre) > 0, which
    // simplifies to normal.z · PERSPECTIVE > offset.
    const facing = normal[2] * PERSPECTIVE - geometry.offset;
    return {
      width: geometry.width,
      height: geometry.height,
      left: (box - geometry.width) / 2,
      top: (box - geometry.height) / 2,
      opacity: facing > 0 ? 1 : 0,
      transform: [
        { perspective: PERSPECTIVE },
        { rotateX: `${rx.value}deg` },
        { rotateY: `${ry.value}deg` },
        { rotateX: `${spec.px}deg` },
        { rotateY: `${spec.py}deg` },
        // RN has no translateZ: turn sideways, slide, and turn back
        { rotateY: '90deg' },
        { translateX: -geometry.offset },
        { rotateY: '-90deg' },
      ],
    };
  });

  const shadeStyle = useAnimatedStyle(() => {
    const normal = rotate(spec.normal, rx.value, ry.value);
    const lit = normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2];
    return { opacity: clamp(0.04 + (1 - Math.max(0, lit)) * 0.5, 0, 0.62) };
  });

  const glossStyle = useAnimatedStyle(() => {
    if (!gloss) return { opacity: 0 };
    const normal = rotate(spec.normal, rx.value, ry.value);
    // Brightest when the cover is turned a little toward the light
    return { opacity: clamp(1 - Math.abs(normal[0] + 0.3) * 3, 0, 1) * 0.55 };
  });

  return (
    <Animated.View style={[styles.face, radius, faceStyle]} pointerEvents="none">
      {children}
      {gloss && (
        <Animated.View style={[StyleSheet.absoluteFill, glossStyle]}>
          <LinearGradient
            colors={['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.22)', 'rgba(255, 255, 255, 0)']}
            locations={[0.2, 0.45, 0.7]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
      <Animated.View style={[StyleSheet.absoluteFill, styles.shade, shadeStyle]} />
    </Animated.View>
  );
}

/** Cream page block with fine page lines running along the edge */
function PageEdge({ direction }: { direction: 'horizontal' | 'vertical' }) {
  const horizontal = direction === 'horizontal';
  return (
    <View style={[StyleSheet.absoluteFill, styles.pages]}>
      <LinearGradient
        colors={PAGE_STRIPES.colors}
        locations={PAGE_STRIPES.locations}
        start={{ x: 0, y: 0 }}
        end={horizontal ? { x: 0, y: 1 } : { x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Cover boards showing at either side of the page block */}
      <View style={[styles.board, horizontal ? styles.boardTop : styles.boardLeft]} />
      <View style={[styles.board, horizontal ? styles.boardBottom : styles.boardRight]} />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    position: 'absolute',
  },
  face: {
    position: 'absolute',
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
  },
  coverRadius: {
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
  },
  shade: {
    backgroundColor: '#000',
  },
  touchArea: {
    position: 'absolute',
  },
  hinge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '7%',
  },
  clothCover: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: '12%',
  },
  coverFrame: {
    position: 'absolute',
    top: '5%',
    bottom: '5%',
    left: '8%',
    right: '6%',
    borderWidth: 1,
  },
  clothTitle: {
    fontSize: 22,
    lineHeight: 27,
    fontFamily: getSerifFontFamily('medium'),
    textAlign: 'center',
    marginBottom: 12,
  },
  clothAuthor: {
    fontSize: 14,
    ...serifItalicStyle,
    textAlign: 'center',
    opacity: 0.85,
  },
  coverSpinner: {
    position: 'absolute',
    bottom: '10%',
  },
  backScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  backText: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: '14%',
  },
  backTitle: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 17,
    lineHeight: 22,
    fontFamily: getSerifFontFamily('medium'),
    textAlign: 'center',
    marginBottom: 8,
  },
  backAuthor: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
    ...serifItalicStyle,
    textAlign: 'center',
  },
  pages: {
    backgroundColor: '#f1e8d4',
  },
  board: {
    position: 'absolute',
    backgroundColor: 'rgba(46, 34, 22, 0.55)',
  },
  boardTop: {
    left: 0,
    right: 0,
    top: 0,
    height: 1.5,
  },
  boardBottom: {
    left: 0,
    right: 0,
    bottom: 0,
    height: 1.5,
  },
  boardLeft: {
    top: 0,
    bottom: 0,
    left: 0,
    width: 1.5,
  },
  boardRight: {
    top: 0,
    bottom: 0,
    right: 0,
    width: 1.5,
  },
});

export default Book3D;
