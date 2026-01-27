/**
 * Storage Service
 *
 * Handles all file storage operations with Supabase Storage:
 * - Upload book spine images
 * - Upload user avatars
 * - Get signed URLs for private files
 * - Delete files
 *
 * Setup Requirements:
 * 1. Create a 'book-spines' bucket in Supabase Storage
 * 2. Create an 'avatars' bucket in Supabase Storage
 * 3. Set appropriate RLS policies for each bucket
 *
 * Usage:
 * import { storageService } from '@/services/storage';
 * const { data, error } = await storageService.uploadBookSpine(uri, userId);
 */

import * as FileSystem from 'expo-file-system';
import { supabase, STORAGE_BUCKETS, handleSupabaseError } from './supabase';
import type { ApiResponse } from '@/types';
import { decode } from 'base64-arraybuffer';

/**
 * Storage Service Class
 * Provides methods for file upload and management
 */
class StorageService {
  /**
   * Upload a book spine image to Supabase Storage
   *
   * Flow:
   * 1. Read the file from local URI (captured by camera or picked from gallery)
   * 2. Convert to base64
   * 3. Upload to Supabase Storage
   * 4. Return the public URL
   *
   * @param localUri - Local file URI from camera or image picker
   * @param userId - User ID for organizing files
   * @returns Public URL of the uploaded image
   */
  async uploadBookSpine(
    localUri: string,
    userId: string
  ): Promise<ApiResponse<string>> {
    try {
      // Generate a unique filename
      const timestamp = Date.now();
      const fileExtension = localUri.split('.').pop() || 'jpg';
      const fileName = `${userId}/${timestamp}.${fileExtension}`;

      // Read the file as base64
      const base64 = await FileSystem.readAsStringAsync(localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Determine content type based on extension
      const contentType = this.getContentType(fileExtension);

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKETS.BOOK_SPINES)
        .upload(fileName, decode(base64), {
          contentType,
          upsert: false,
        });

      if (error) throw error;

      // Get the public URL
      const {
        data: { publicUrl },
      } = supabase.storage
        .from(STORAGE_BUCKETS.BOOK_SPINES)
        .getPublicUrl(data.path);

      return { data: publicUrl, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Upload a user avatar image
   *
   * @param localUri - Local file URI
   * @param userId - User ID
   * @returns Public URL of the uploaded avatar
   */
  async uploadAvatar(
    localUri: string,
    userId: string
  ): Promise<ApiResponse<string>> {
    try {
      // Generate filename (one avatar per user, will overwrite)
      const fileExtension = localUri.split('.').pop() || 'jpg';
      const fileName = `${userId}/avatar.${fileExtension}`;

      // Read the file as base64
      const base64 = await FileSystem.readAsStringAsync(localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const contentType = this.getContentType(fileExtension);

      // Upload to Supabase Storage (upsert to replace existing)
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKETS.AVATARS)
        .upload(fileName, decode(base64), {
          contentType,
          upsert: true, // Replace existing avatar
        });

      if (error) throw error;

      // Get the public URL with cache-busting query param
      const {
        data: { publicUrl },
      } = supabase.storage
        .from(STORAGE_BUCKETS.AVATARS)
        .getPublicUrl(data.path);

      // Add timestamp to bust cache
      const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`;

      return { data: urlWithCacheBust, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Delete a file from storage
   *
   * @param bucket - Storage bucket name
   * @param path - File path within the bucket
   */
  async deleteFile(
    bucket: string,
    path: string
  ): Promise<ApiResponse<null>> {
    try {
      const { error } = await supabase.storage.from(bucket).remove([path]);

      if (error) throw error;

      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Delete a book spine image
   * Extracts the path from the full URL
   *
   * @param imageUrl - Full public URL of the image
   */
  async deleteBookSpine(imageUrl: string): Promise<ApiResponse<null>> {
    try {
      // Extract the path from the URL
      const path = this.extractPathFromUrl(imageUrl, STORAGE_BUCKETS.BOOK_SPINES);
      if (!path) {
        throw new Error('Invalid image URL');
      }

      return this.deleteFile(STORAGE_BUCKETS.BOOK_SPINES, path);
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Get a signed URL for private files
   * Use this if your bucket is not public
   *
   * @param bucket - Storage bucket name
   * @param path - File path
   * @param expiresIn - Expiration time in seconds (default 1 hour)
   */
  async getSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number = 3600
  ): Promise<ApiResponse<string>> {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn);

      if (error) throw error;

      return { data: data.signedUrl, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * List files in a directory
   *
   * @param bucket - Storage bucket name
   * @param path - Directory path
   */
  async listFiles(
    bucket: string,
    path: string
  ): Promise<ApiResponse<{ name: string; id: string }[]>> {
    try {
      const { data, error } = await supabase.storage.from(bucket).list(path, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' },
      });

      if (error) throw error;

      return { data: data || [], error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Helper: Get content type from file extension
   */
  private getContentType(extension: string): string {
    const contentTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      heic: 'image/heic',
    };

    return contentTypes[extension.toLowerCase()] || 'image/jpeg';
  }

  /**
   * Helper: Extract file path from public URL
   */
  private extractPathFromUrl(url: string, bucket: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split(`/storage/v1/object/public/${bucket}/`);
      if (pathParts.length === 2) {
        return decodeURIComponent(pathParts[1].split('?')[0]);
      }
      return null;
    } catch {
      return null;
    }
  }
}

// Export a singleton instance
export const storageService = new StorageService();

export default storageService;
