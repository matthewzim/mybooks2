/**
 * CameraScanner Component
 *
 * Provides camera functionality for scanning book spines.
 * Users can take photos or select from gallery.
 *
 * Features:
 * - Camera preview with capture button
 * - Gallery picker option
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
  Colors,
  Spacing,
  BorderRadius,
  Typography,
} from '@/constants/theme';

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
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
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
        quality: 0.8,
        skipProcessing: false,
      });

      if (photo?.uri) {
        setCapturedImage(photo.uri);
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
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 3], // Book spine aspect ratio
      });

      if (!result.canceled && result.assets[0]) {
        setCapturedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Failed to pick image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  /**
   * Confirm and upload the captured image
   */
  const confirmCapture = async () => {
    if (!capturedImage) return;
    await onCapture(capturedImage);
  };

  /**
   * Retake/reselect image
   */
  const retake = () => {
    setCapturedImage(null);
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
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color={Colors.textSecondary} />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            We need camera access to scan book spines. Please grant permission
            in your device settings.
          </Text>
          <Pressable style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </Pressable>
          <Pressable style={styles.galleryButton} onPress={pickFromGallery}>
            <Ionicons name="images-outline" size={20} color={Colors.primary} />
            <Text style={styles.galleryButtonText}>Choose from Gallery</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Image preview mode
  if (capturedImage) {
    return (
      <View style={styles.container}>
        <View style={styles.previewContainer}>
          <Image
            source={{ uri: capturedImage }}
            style={styles.previewImage}
            contentFit="contain"
          />

          {isUploading ? (
            <View style={styles.uploadingOverlay}>
              <ActivityIndicator size="large" color={Colors.textInverse} />
              <Text style={styles.uploadingText}>Uploading...</Text>
            </View>
          ) : (
            <View style={styles.previewControls}>
              <Pressable
                style={[styles.previewButton, styles.retakeButton]}
                onPress={retake}
              >
                <Ionicons name="refresh" size={24} color={Colors.text} />
                <Text style={styles.previewButtonText}>Retake</Text>
              </Pressable>

              <Pressable
                style={[styles.previewButton, styles.confirmButton]}
                onPress={confirmCapture}
              >
                <Ionicons name="checkmark" size={24} color={Colors.textInverse} />
                <Text style={[styles.previewButtonText, styles.confirmText]}>
                  Use Photo
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Cancel button */}
        <Pressable style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  // Camera mode
  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
      >
        {/* Guide overlay */}
        <View style={styles.guideOverlay}>
          <View style={styles.guideBox}>
            <Text style={styles.guideText}>
              Position the book spine within the frame
            </Text>
          </View>
        </View>

        {/* Camera controls */}
        <View style={styles.cameraControls}>
          {/* Gallery button */}
          <Pressable style={styles.controlButton} onPress={pickFromGallery}>
            <Ionicons name="images" size={28} color={Colors.textInverse} />
          </Pressable>

          {/* Capture button */}
          <Pressable style={styles.captureButton} onPress={takePicture}>
            <View style={styles.captureButtonInner} />
          </Pressable>

          {/* Flip camera button */}
          <Pressable style={styles.controlButton} onPress={toggleCameraFacing}>
            <Ionicons name="camera-reverse" size={28} color={Colors.textInverse} />
          </Pressable>
        </View>
      </CameraView>

      {/* Cancel button */}
      <Pressable style={styles.cancelButton} onPress={onCancel}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
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
    color: Colors.textInverse,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  permissionText: {
    fontSize: Typography.sizes.md,
    color: Colors.textInverse,
    textAlign: 'center',
    opacity: 0.8,
    marginBottom: Spacing.lg,
  },
  permissionButton: {
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  permissionButtonText: {
    color: Colors.textInverse,
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
    color: Colors.textInverse,
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
    borderColor: Colors.textInverse,
    borderRadius: BorderRadius.sm,
    justifyContent: 'flex-end',
    padding: Spacing.sm,
  },
  guideText: {
    color: Colors.textInverse,
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
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.textInverse,
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
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingText: {
    color: Colors.textInverse,
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
  retakeButton: {
    backgroundColor: Colors.textInverse,
  },
  confirmButton: {
    backgroundColor: Colors.success,
  },
  previewButtonText: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
  },
  confirmText: {
    color: Colors.textInverse,
  },
  cancelButton: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: Colors.textInverse,
    fontSize: Typography.sizes.md,
  },
});

export default CameraScanner;
