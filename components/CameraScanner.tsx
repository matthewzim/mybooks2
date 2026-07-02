/**
 * CameraScanner Component
 *
 * Provides camera functionality for scanning book spines.
 * Users can take photos or select from gallery.
 *
 * Features:
 * - Camera preview with capture button
 * - Gallery picker option
 * - 4-corner crop adjustment for spine selection
 * - Image preview before upload
 * - Loading state during upload
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  Spacing,
  BorderRadius,
  Typography,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { SpineCropper, CropRect } from './SpineCropper';
import { SpineFramer } from './SpineFramer';

interface CameraScannerProps {
  onCapture: (imageUri: string) => Promise<void>;
  onCancel: () => void;
  isUploading?: boolean;
}

// Guide frame shown over the camera preview. The captured photo is cropped
// to this region (plus margin) so the next step matches what the user framed.
const GUIDE_FRAME_WIDTH = 100;
const GUIDE_FRAME_HEIGHT = 300;
// Extra context kept around the guide frame, as a fraction of its size,
// so the framing step has room to fine-tune
const GUIDE_CROP_MARGIN = 0.35;

export function CameraScanner({
  onCapture,
  onCancel,
  isUploading = false,
}: CameraScannerProps) {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [rawCapturedImage, setRawCapturedImage] = useState<string | null>(null);
  const [framedImage, setFramedImage] = useState<string | null>(null);
  const [croppedImage, setCroppedImage] = useState<string | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const cameraRef = useRef<CameraView>(null);

  // Request permissions on mount
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  /**
   * Crop a captured photo to the on-screen guide frame.
   *
   * The camera preview fills the screen (cover fit), so the photo extends
   * beyond what the preview showed. This maps the guide frame rectangle
   * through the cover-fit transform into photo pixel coordinates and crops
   * to it (plus margin), so the framing step shows the region the user
   * actually positioned the spine in. Falls back to the full photo if the
   * mapping isn't possible.
   */
  const cropToGuideFrame = async (photo: {
    uri: string;
    width?: number;
    height?: number;
  }): Promise<string> => {
    const { width: previewWidth, height: previewHeight } = previewSize;
    let photoWidth = photo.width ?? 0;
    let photoHeight = photo.height ?? 0;

    if (!previewWidth || !previewHeight || !photoWidth || !photoHeight) {
      return photo.uri;
    }

    // Some platforms report pre-rotation dimensions for photos with EXIF
    // orientation; if the aspect disagrees with the preview, swap them
    if (
      (previewWidth < previewHeight && photoWidth > photoHeight) ||
      (previewWidth > previewHeight && photoWidth < photoHeight)
    ) {
      [photoWidth, photoHeight] = [photoHeight, photoWidth];
    }

    try {
      // Cover fit: photo scaled to fill the preview, centered, edges cropped
      const scale = Math.max(
        previewWidth / photoWidth,
        previewHeight / photoHeight
      );
      const offsetX = (photoWidth * scale - previewWidth) / 2;
      const offsetY = (photoHeight * scale - previewHeight) / 2;

      // Guide frame is centered in the preview; expand it by the margin
      const marginX = GUIDE_FRAME_WIDTH * GUIDE_CROP_MARGIN;
      const marginY = GUIDE_FRAME_HEIGHT * GUIDE_CROP_MARGIN;
      const frameLeft = (previewWidth - GUIDE_FRAME_WIDTH) / 2 - marginX;
      const frameTop = (previewHeight - GUIDE_FRAME_HEIGHT) / 2 - marginY;
      const frameRight = (previewWidth + GUIDE_FRAME_WIDTH) / 2 + marginX;
      const frameBottom = (previewHeight + GUIDE_FRAME_HEIGHT) / 2 + marginY;

      // Map preview coordinates to photo pixels and clamp to bounds
      const cropX = Math.max(0, Math.floor((frameLeft + offsetX) / scale));
      const cropY = Math.max(0, Math.floor((frameTop + offsetY) / scale));
      const cropRight = Math.min(
        photoWidth,
        Math.ceil((frameRight + offsetX) / scale)
      );
      const cropBottom = Math.min(
        photoHeight,
        Math.ceil((frameBottom + offsetY) / scale)
      );
      const cropWidth = cropRight - cropX;
      const cropHeight = cropBottom - cropY;

      if (cropWidth < 1 || cropHeight < 1) {
        return photo.uri;
      }

      const result = await ImageManipulator.manipulateAsync(
        photo.uri,
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

      return result.uri;
    } catch (error) {
      console.error('Failed to crop to guide frame:', error);
      return photo.uri;
    }
  };

  /**
   * Take a photo with the camera
   */
  const takePicture = async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
      });

      if (photo?.uri) {
        const framedUri = await cropToGuideFrame(photo);
        setCropRect(null);
        setRawCapturedImage(framedUri);
      }
    } catch (error) {
      console.error('Failed to take picture:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  /**
   * Pick an image from the gallery
   */
  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: false, // We use our own cropper
      });

      if (!result.canceled && result.assets[0]) {
        // Gallery images weren't taken through the guide frame; show them
        // whole and let the framing step do the positioning
        setCropRect(null);
        setRawCapturedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Failed to pick image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  /**
   * Handle frame completion - proceed to corner cropper with zoomed-in image
   */
  const handleFrameComplete = (framedUri: string) => {
    // A newly framed image invalidates any previously chosen corner positions
    setCropRect(null);
    setFramedImage(framedUri);
  };

  /**
   * Handle frame cancel - go back to camera
   */
  const handleFrameCancel = () => {
    setRawCapturedImage(null);
  };

  /**
   * Handle crop completion - remember the crop region so "Adjust Crop"
   * reopens the cropper with the corners where the user left them
   */
  const handleCropComplete = (croppedUri: string, rect: CropRect) => {
    setCropRect(rect);
    setCroppedImage(croppedUri);
  };

  /**
   * Handle crop cancel - go back to framing step
   */
  const handleCropCancel = () => {
    setFramedImage(null);
  };

  /**
   * Confirm and upload the cropped image
   */
  const confirmCapture = async () => {
    if (!croppedImage) return;
    await onCapture(croppedImage);
  };

  /**
   * Retake/reselect image - go back to cropper
   */
  const retake = () => {
    setCroppedImage(null);
  };

  /**
   * Start over - go back to camera
   */
  const startOver = () => {
    setRawCapturedImage(null);
    setFramedImage(null);
    setCroppedImage(null);
    setCropRect(null);
  };

  /**
   * Toggle camera facing
   */
  const toggleCameraFacing = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  // Permission not yet determined
  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: colors.primary }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={[styles.container, { backgroundColor: colors.primary }]}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color={colors.textInverse} />
          <Text style={[styles.permissionTitle, { color: colors.textInverse }]}>Camera Access Required</Text>
          <Text style={[styles.permissionText, { color: colors.textInverse }]}>
            We need camera access to scan book spines. Please grant permission
            in your device settings.
          </Text>
          <Pressable style={[styles.permissionButton, { backgroundColor: colors.accent }]} onPress={requestPermission}>
            <Text style={[styles.permissionButtonText, { color: colors.textInverse }]}>Grant Permission</Text>
          </Pressable>
          <Pressable style={styles.galleryButton} onPress={pickFromGallery}>
            <Ionicons name="images-outline" size={20} color={colors.textInverse} />
            <Text style={[styles.galleryButtonText, { color: colors.textInverse }]}>Choose from Gallery</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Framing mode - zoom and position the spine area
  if (rawCapturedImage && !framedImage && !croppedImage) {
    return (
      <SpineFramer
        imageUri={rawCapturedImage}
        onFrameComplete={handleFrameComplete}
        onCancel={handleFrameCancel}
      />
    );
  }

  // Cropping mode - fine-tune corners on the zoomed-in framed image
  if (framedImage && !croppedImage) {
    return (
      <SpineCropper
        imageUri={framedImage}
        initialCrop={cropRect ?? undefined}
        onCropComplete={handleCropComplete}
        onCancel={handleCropCancel}
      />
    );
  }

  // Image preview mode - show cropped image for confirmation
  if (croppedImage) {
    return (
      <View style={[styles.container, { backgroundColor: colors.primary }]}>
        <View style={styles.previewContainer}>
          <Image
            source={{ uri: croppedImage }}
            style={styles.previewImage}
            contentFit="contain"
          />

          {isUploading ? (
            <View style={[styles.uploadingOverlay, { backgroundColor: colors.overlay }]}>
              <ActivityIndicator size="large" color={colors.textInverse} />
              <Text style={[styles.uploadingText, { color: colors.textInverse }]}>Uploading...</Text>
            </View>
          ) : (
            <View style={styles.previewControls}>
              <Pressable
                style={[styles.previewButton, { backgroundColor: colors.textInverse }]}
                onPress={retake}
              >
                <Ionicons name="crop" size={24} color={colors.text} />
                <Text style={[styles.previewButtonText, { color: colors.text }]}>Adjust Crop</Text>
              </Pressable>

              <Pressable
                style={[styles.previewButton, { backgroundColor: colors.success }]}
                onPress={confirmCapture}
              >
                <Ionicons name="checkmark" size={24} color={colors.textInverse} />
                <Text style={[styles.previewButtonText, { color: colors.textInverse }]}>
                  Use Photo
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Start over button */}
        <Pressable style={styles.cancelButton} onPress={startOver}>
          <Text style={[styles.cancelButtonText, { color: colors.textInverse }]}>Start Over</Text>
        </Pressable>
      </View>
    );
  }

  // Camera mode
  return (
    <View style={[styles.container, { backgroundColor: colors.primary }]}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        onLayout={(event) => setPreviewSize(event.nativeEvent.layout)}
      >
        {/* Guide overlay */}
        <View style={styles.guideOverlay}>
          <View style={[styles.guideBox, { borderColor: colors.textInverse }]}>
            <Text style={[styles.guideText, { color: colors.textInverse }]}>
              Position the book spine within the frame
            </Text>
          </View>
        </View>

        {/* Camera controls */}
        <View style={styles.cameraControls}>
          {/* Gallery button */}
          <Pressable style={styles.controlButton} onPress={pickFromGallery}>
            <Ionicons name="images" size={28} color={colors.textInverse} />
          </Pressable>

          {/* Capture button */}
          <Pressable style={[styles.captureButton, { backgroundColor: colors.overlayWhite }]} onPress={takePicture}>
            <View style={[styles.captureButtonInner, { backgroundColor: colors.textInverse }]} />
          </Pressable>

          {/* Flip camera button */}
          <Pressable style={styles.controlButton} onPress={toggleCameraFacing}>
            <Ionicons name="camera-reverse" size={28} color={colors.textInverse} />
          </Pressable>
        </View>
      </CameraView>

      {/* Cancel button */}
      <Pressable style={styles.cancelButton} onPress={onCancel}>
        <Text style={[styles.cancelButtonText, { color: colors.textInverse }]}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  permissionTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  permissionText: {
    fontSize: Typography.sizes.md,
    textAlign: 'center',
    opacity: 0.8,
    marginBottom: Spacing.lg,
  },
  permissionButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  permissionButtonText: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  galleryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  galleryButtonText: {
    fontSize: Typography.sizes.md,
  },
  guideOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideBox: {
    width: GUIDE_FRAME_WIDTH,
    height: GUIDE_FRAME_HEIGHT,
    borderWidth: 2,
    borderRadius: BorderRadius.sm,
    justifyContent: 'flex-end',
    padding: Spacing.sm,
  },
  guideText: {
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
  },
  cameraControls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  controlButton: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  previewContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '80%',
    height: '60%',
    borderRadius: BorderRadius.lg,
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingText: {
    fontSize: Typography.sizes.lg,
    marginTop: Spacing.md,
  },
  previewControls: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: Spacing.xl,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  previewButtonText: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  cancelButton: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: Typography.sizes.md,
  },
});

export default CameraScanner;
