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
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  Spacing,
  BorderRadius,
  Typography,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { SpineCropper } from './SpineCropper';

interface CameraScannerProps {
  onCapture: (imageUri: string) => Promise<void>;
  onCancel: () => void;
  isUploading?: boolean;
}

export function CameraScanner({
  onCapture,
  onCancel,
  isUploading = false,
}: CameraScannerProps) {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [rawCapturedImage, setRawCapturedImage] = useState<string | null>(null);
  const [croppedImage, setCroppedImage] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  // Request permissions on mount
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

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
        // Show cropper first
        setRawCapturedImage(photo.uri);
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
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        allowsEditing: false, // We use our own cropper
      });

      if (!result.canceled && result.assets[0]) {
        // Show cropper first
        setRawCapturedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Failed to pick image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  /**
   * Handle crop completion
   */
  const handleCropComplete = (croppedUri: string) => {
    setCroppedImage(croppedUri);
  };

  /**
   * Handle crop cancel - go back to camera
   */
  const handleCropCancel = () => {
    setRawCapturedImage(null);
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
    setCroppedImage(null);
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

  // Cropping mode - show spine cropper
  if (rawCapturedImage && !croppedImage) {
    return (
      <SpineCropper
        imageUri={rawCapturedImage}
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
    width: 100,
    height: 300,
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
