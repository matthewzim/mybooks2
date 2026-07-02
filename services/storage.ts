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

import * as FileSystem from 'expo-file-system/legacy';
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
        encoding: 'base64',
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
        encoding: 'base64',
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
   * Upload a book cover image fetched from a remote URL to Supabase Storage.
   *
   * @param remoteUrl - Remote image URL (e.g. from Google Books API)
   * @param bookId - Global book ID used to organise the file path
   * @returns Public URL of the uploaded cover image
   */
  async uploadBookCover(
    remoteUrl: string,
    bookId: string
  ): Promise<ApiResponse<string>> {
    try {
      // Download the image to a temporary local file
      const tmpPath = `${FileSystem.cacheDirectory}cover_${bookId}_${Date.now()}.jpg`;
      const downloadResult = await FileSystem.downloadAsync(remoteUrl, tmpPath);

      if (downloadResult.status !== 200) {
        throw new Error(`Failed to download cover image (HTTP ${downloadResult.status})`);
      }

      // Read the downloaded file as base64
      const base64 = await FileSystem.readAsStringAsync(tmpPath, {
        encoding: 'base64',
      });

      const fileName = `${bookId}/cover.jpg`;
      const contentType = 'image/jpeg';

      // Upload to the book-covers bucket (upsert so re-fetches overwrite)
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKETS.BOOK_COVERS)
        .upload(fileName, decode(base64), {
          contentType,
          upsert: true,
        });

      if (error) throw error;

      // Get the public URL
      const {
        data: { publicUrl },
      } = supabase.storage
        .from(STORAGE_BUCKETS.BOOK_COVERS)
        .getPublicUrl(data.path);

      // Clean up temp file (fire-and-forget)
      FileSystem.deleteAsync(tmpPath, { idempotent: true }).catch(() => {});

      return { data: publicUrl, error: null };
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
      const path = extractStoragePathFromUrl(imageUrl, STORAGE_BUCKETS.BOOK_SPINES)
        ?? this.extractPathFromUrl(imageUrl, STORAGE_BUCKETS.BOOK_SPINES);
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
   * Delete a book cover image from storage.
   */
  async deleteBookCover(imageUrl: string): Promise<ApiResponse<null>> {
    try {
      const path = extractStoragePathFromUrl(imageUrl, STORAGE_BUCKETS.BOOK_COVERS)
        ?? this.extractPathFromUrl(imageUrl, STORAGE_BUCKETS.BOOK_COVERS);

      if (!path) {
        throw new Error('Invalid cover image URL');
      }

      return this.deleteFile(STORAGE_BUCKETS.BOOK_COVERS, path);
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Delete a user avatar image from storage.
   */
  async deleteAvatar(imageUrl: string): Promise<ApiResponse<null>> {
    try {
      const path = extractStoragePathFromUrl(imageUrl, STORAGE_BUCKETS.AVATARS)
        ?? this.extractPathFromUrl(imageUrl, STORAGE_BUCKETS.AVATARS);

      if (!path) {
        throw new Error('Invalid avatar URL');
      }

      return this.deleteFile(STORAGE_BUCKETS.AVATARS, path);
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

// ---------------------------------------------------------------------------
// In-memory URL resolution cache
// Avoids repeated Supabase `createSignedUrl` network calls when reopening a
// bookshelf. Entries are kept for 50 minutes (signed URLs expire in 60).
// ---------------------------------------------------------------------------
const URL_CACHE_TTL_MS = 50 * 60 * 1000;
const urlCache = new Map<string, { url: string; expiry: number }>();

function getCachedUrl(key: string): string | null {
  const entry = urlCache.get(key);
  if (entry && Date.now() < entry.expiry) return entry.url;
  if (entry) urlCache.delete(key);
  return null;
}

function setCachedUrl(key: string, url: string): void {
  urlCache.set(key, { url, expiry: Date.now() + URL_CACHE_TTL_MS });
}

/**
 * Get the public URL for a book spine image from the book-spines bucket
 * Handles both full URLs and relative paths within the bucket
 *
 * @param imageUrlOrPath - Full URL or path within the bucket
 * @returns Full public URL for the image, or null if input is invalid
 */
function extractStoragePathFromUrl(
  imageUrlOrPath: string,
  bucket: string
): string | null {
  try {
    const urlObj = new URL(imageUrlOrPath);
    const publicPrefix = `/storage/v1/object/public/${bucket}/`;
    const signedPrefix = `/storage/v1/object/sign/${bucket}/`;

    if (urlObj.pathname.includes(publicPrefix)) {
      return decodeURIComponent(urlObj.pathname.split(publicPrefix)[1]?.split('?')[0] || '');
    }

    if (urlObj.pathname.includes(signedPrefix)) {
      return decodeURIComponent(urlObj.pathname.split(signedPrefix)[1]?.split('?')[0] || '');
    }

    return null;
  } catch {
    return null;
  }
}

export async function getCoverImageUrl(
  imageUrlOrPath: string | null | undefined
): Promise<string | null> {
  if (!imageUrlOrPath) {
    return null;
  }

  const cached = getCachedUrl(`cover:${imageUrlOrPath}`);
  if (cached) return cached;

  const isFullUrl =
    imageUrlOrPath.startsWith('http://') || imageUrlOrPath.startsWith('https://');

  if (isFullUrl) {
    const extractedPath = extractStoragePathFromUrl(
      imageUrlOrPath,
      STORAGE_BUCKETS.BOOK_COVERS
    );

    if (!extractedPath) {
      return imageUrlOrPath;
    }

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.BOOK_COVERS)
      .createSignedUrl(extractedPath, 3600);

    if (!error && data?.signedUrl) {
      setCachedUrl(`cover:${imageUrlOrPath}`, data.signedUrl);
      return data.signedUrl;
    }

    return imageUrlOrPath;
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from(STORAGE_BUCKETS.BOOK_COVERS)
    .createSignedUrl(imageUrlOrPath, 3600);

  if (!signedError && signedData?.signedUrl) {
    setCachedUrl(`cover:${imageUrlOrPath}`, signedData.signedUrl);
    return signedData.signedUrl;
  }

  const {
    data: { publicUrl },
  } = supabase.storage
    .from(STORAGE_BUCKETS.BOOK_COVERS)
    .getPublicUrl(imageUrlOrPath);

  return publicUrl;
}

export async function getSpineImageUrl(
  imageUrlOrPath: string | null | undefined
): Promise<string | null> {
  if (!imageUrlOrPath) {
    return null;
  }

  const cached = getCachedUrl(`spine:${imageUrlOrPath}`);
  if (cached) return cached;

  const isFullUrl =
    imageUrlOrPath.startsWith('http://') || imageUrlOrPath.startsWith('https://');

  // Non-Supabase absolute URL (e.g. external CDN) can be used as-is.
  if (isFullUrl) {
    const extractedPath = extractStoragePathFromUrl(
      imageUrlOrPath,
      STORAGE_BUCKETS.BOOK_SPINES
    );

    if (!extractedPath) {
      return imageUrlOrPath;
    }

    // Use a signed URL so private buckets still render correctly.
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.BOOK_SPINES)
      .createSignedUrl(extractedPath, 3600);

    if (!error && data?.signedUrl) {
      setCachedUrl(`spine:${imageUrlOrPath}`, data.signedUrl);
      return data.signedUrl;
    }

    // Fall back to the existing URL for public buckets.
    return imageUrlOrPath;
  }

  // Relative path in the bucket → prefer signed URL, then public URL fallback.
  const { data: signedData, error: signedError } = await supabase.storage
    .from(STORAGE_BUCKETS.BOOK_SPINES)
    .createSignedUrl(imageUrlOrPath, 3600);

  if (!signedError && signedData?.signedUrl) {
    setCachedUrl(`spine:${imageUrlOrPath}`, signedData.signedUrl);
    return signedData.signedUrl;
  }

  const {
    data: { publicUrl },
  } = supabase.storage
    .from(STORAGE_BUCKETS.BOOK_SPINES)
    .getPublicUrl(imageUrlOrPath);

  return publicUrl;
}

/**
 * Get a public (non-expiring) URL for a spine image.
 * Used by widget data sync where signed URLs would expire before the widget
 * timeline refreshes.
 */
export function getSpinePublicUrl(
  imageUrlOrPath: string | null | undefined
): string | null {
  if (!imageUrlOrPath) return null;

  const isFullUrl =
    imageUrlOrPath.startsWith('http://') || imageUrlOrPath.startsWith('https://');

  if (isFullUrl) {
    const extractedPath = extractStoragePathFromUrl(
      imageUrlOrPath,
      STORAGE_BUCKETS.BOOK_SPINES
    );
    if (!extractedPath) {
      // External URL – use as-is
      return imageUrlOrPath;
    }
    // Re-derive the public URL (no signing, no expiry)
    const {
      data: { publicUrl },
    } = supabase.storage
      .from(STORAGE_BUCKETS.BOOK_SPINES)
      .getPublicUrl(extractedPath);
    return publicUrl;
  }

  // Relative path → public URL
  const {
    data: { publicUrl },
  } = supabase.storage
    .from(STORAGE_BUCKETS.BOOK_SPINES)
    .getPublicUrl(imageUrlOrPath);
  return publicUrl;
}

/**
 * Signed-URL lifetime for widget spine images. The widget timeline refreshes
 * every 6 hours and the app re-pushes fresh URLs on every data sync, so 30
 * days gives plenty of headroom even if the app isn't opened for a while.
 */
const WIDGET_SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 30;

/**
 * Resolve spine image URLs for the home-screen widget.
 *
 * The book-spines bucket is private, so the public URLs previously pushed to
 * the widget returned 400 and every spine rendered as a lettered placeholder.
 * Signed URLs work for private and public buckets alike; all paths are signed
 * in a single batched request. External (non-Supabase) URLs pass through
 * unchanged, and any path that fails to sign falls back to its public URL.
 *
 * @returns One resolved URL (or null) per input, in the same order.
 */
export async function getSpineWidgetUrls(
  imageUrlsOrPaths: (string | null | undefined)[]
): Promise<(string | null)[]> {
  type Resolved =
    | { kind: 'none' }
    | { kind: 'external'; url: string }
    | { kind: 'path'; path: string };

  const resolved: Resolved[] = imageUrlsOrPaths.map((input) => {
    if (!input) return { kind: 'none' };

    const isFullUrl = input.startsWith('http://') || input.startsWith('https://');
    if (isFullUrl) {
      const path = extractStoragePathFromUrl(input, STORAGE_BUCKETS.BOOK_SPINES);
      return path ? { kind: 'path', path } : { kind: 'external', url: input };
    }

    return { kind: 'path', path: input };
  });

  const paths = [
    ...new Set(
      resolved.flatMap((r) => (r.kind === 'path' ? [r.path] : []))
    ),
  ];

  const signedByPath = new Map<string, string>();
  if (paths.length > 0) {
    try {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKETS.BOOK_SPINES)
        .createSignedUrls(paths, WIDGET_SIGNED_URL_EXPIRY_SECONDS);

      if (!error && data) {
        for (const item of data) {
          if (item.path && item.signedUrl && !item.error) {
            signedByPath.set(item.path, item.signedUrl);
          }
        }
      }
    } catch {
      // Fall back to public URLs below.
    }
  }

  return resolved.map((r) => {
    if (r.kind === 'none') return null;
    if (r.kind === 'external') return r.url;
    return signedByPath.get(r.path) ?? getSpinePublicUrl(r.path);
  });
}

export default storageService;
