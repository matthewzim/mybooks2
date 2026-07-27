/**
 * Widget Utilities
 *
 * Utilities for managing iOS home screen widget data.
 * Uses expo-widgets to share data with the widget via updateSnapshot.
 *
 * The widget is configurable via an AppIntent so users can choose which
 * bookshelf to display.  We push ALL bookshelves to the native side;
 * the Swift timeline provider picks the one selected by the intent.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Settings } from 'react-native';
import type { WidgetData, WidgetBookshelf, Bookshelf, Book } from '@/types';
import { getSpineWidgetUrls } from '@/services/storage';

const WIDGET_DATA_KEY = '@tinyshelves_widget_data';
const WIDGET_SELECTED_SHELF_KEY = '@tinyshelves_widget_shelf';
const WIDGET_PREMIUM_KEY = '@tinyshelves_widget_premium';

/**
 * Caps on what gets pushed into the widget snapshot.
 *
 * The snapshot lives in app-group UserDefaults, which is read synchronously by
 * the widget extension inside its ~30MB memory budget — an unbounded library
 * would push a payload large enough to slow (or kill) every timeline build.
 * Only the selected shelf is ever rendered, so shelves past the cap simply
 * don't appear in the widget's shelf picker.
 */
const MAX_WIDGET_SHELVES = 25;
/**
 * The widget draws at most ~20 spines per row and drops any that overflow the
 * last row, so pushing (and downloading) more than this per shelf is wasted
 * payload and wasted Storage egress.
 */
const MAX_WIDGET_BOOKS_PER_SHELF = 18;

/**
 * How long a previously signed spine URL is reused before being re-signed.
 * Shorter than the 30-day signing window in getSpineWidgetUrls so a reused URL
 * never reaches the widget close to expiry.
 */
const RESOLVED_URL_REUSE_MS = 20 * 24 * 60 * 60 * 1000;

/**
 * Lazily import the widget so Android/web bundles don't crash.
 * The widget module is only usable on iOS.
 */
function getBookshelfWidget(): {
  updateSnapshot: (props: Record<string, unknown>) => void;
} | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const widget = require('../widgets/bookshelf').default;
    return widget;
  } catch {
    return null;
  }
}

/**
 * Push all bookshelf data to the native widget via expo-widgets updateSnapshot.
 * The native configurable timeline provider reads the selected bookshelf from
 * this data based on the user's AppIntent selection.
 *
 * Includes `isPremium` so the widget can gate content for free users.
 */
function pushToWidget(widgetData: WidgetData, isPremium: boolean): void {
  const widget = getBookshelfWidget();
  if (!widget) return;

  const payload = {
    isPremium,
    bookshelves: widgetData.bookshelves.map((shelf) => ({
      id: shelf.id,
      name: shelf.name,
      coverColor: shelf.cover_color,
      shelfStyle: shelf.shelf_style,
      books: shelf.books.map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        imageUrl: b.image_url ?? '',
        resolvedImageUrl: b.resolved_image_url ?? '',
      })),
    })),
  };

  // Primary: expo-widgets updateSnapshot (writes to app group UserDefaults)
  widget.updateSnapshot(payload);

  // Fallback: also write directly to UserDefaults.standard so the widget
  // can find the data even if the app group container isn't properly shared.
  // Only one key is written — the native side tries every known key name in
  // order, so a second copy just doubles the bytes crossing the bridge and
  // sitting in UserDefaults for a payload that can run to hundreds of books.
  if (Platform.OS === 'ios') {
    try {
      Settings.set({
        '__expo_widgets_BookshelfWidget_timeline': [payload],
      });
    } catch {
      // Settings module may not support nested objects on all RN versions
    }
  }
}

/**
 * Widget Manager Class
 * Handles all widget-related data operations
 */
class WidgetManager {
  /**
   * In-memory cache of the premium flag so that `getIsPremium` never returns
   * a stale value due to an AsyncStorage race.  `syncPremiumStatus` sets this
   * synchronously; `syncLibrarySnapshot` reads it without awaiting AsyncStorage.
   */
  private _isPremiumCached: boolean | null = null;

  /**
   * Serializes every read-modify-write of the widget snapshot.
   *
   * `syncLibrarySnapshot` (library refresh) and `updateWidgetWithBookshelf`
   * (book add/edit/delete) both rewrite the same AsyncStorage key, and both
   * await network work first. Without a queue two overlapping syncs interleave
   * their read and write halves and the slower one silently discards the
   * other's shelves.
   */
  private _writeChain: Promise<unknown> = Promise.resolve();

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const run = this._writeChain.then(operation, operation);
    // Keep the chain alive regardless of how this operation settles.
    this._writeChain = run.catch(() => {});
    return run;
  }

  /**
   * Build a map of image_url → already-signed widget URL from the last
   * snapshot, so a resync only signs spines it has never seen.
   *
   * The library refresh syncs the widget on every mount; re-signing an
   * unchanged library each time is the difference between a handful of Storage
   * requests per user per install and a burst of them on every app open.
   */
  private async loadReusableUrls(): Promise<Map<string, string>> {
    const reusable = new Map<string, string>();
    const existing = await this.getWidgetData();
    if (!existing) return reusable;

    const signedAt = Date.parse(existing.resolvedAt ?? existing.lastUpdated ?? '');
    if (!Number.isFinite(signedAt) || Date.now() - signedAt > RESOLVED_URL_REUSE_MS) {
      return reusable;
    }

    for (const shelf of existing.bookshelves ?? []) {
      for (const book of shelf.books ?? []) {
        if (book.image_url && book.resolved_image_url) {
          reusable.set(book.image_url, book.resolved_image_url);
        }
      }
    }

    return reusable;
  }

  /**
   * Transform bookshelves to widget-compatible format, resolving spine image
   * URLs so the native widget can download them.
   *
   * The book-spines bucket is private, so the widget needs long-lived signed
   * URLs — plain public URLs return 400 and every spine falls back to a
   * lettered placeholder. Every unresolved spine across *all* shelves is
   * signed together, rather than one signing round trip per shelf.
   */
  private async transformBookshelvesForWidget(
    shelves: (Bookshelf & { books: Book[] })[],
    reusableUrls: Map<string, string>
  ): Promise<WidgetBookshelf[]> {
    const trimmed = shelves.slice(0, MAX_WIDGET_SHELVES).map((shelf) => ({
      shelf,
      books: shelf.books
        .slice()
        .sort((a, b) => a.position - b.position)
        .slice(0, MAX_WIDGET_BOOKS_PER_SHELF),
    }));

    const unresolved = trimmed.flatMap(({ books }) =>
      books
        .map((b) => b.image_url)
        .filter((url): url is string => !!url && !reusableUrls.has(url))
    );

    const signed = await getSpineWidgetUrls(unresolved);
    const resolvedByUrl = new Map(reusableUrls);
    unresolved.forEach((url, index) => {
      const resolved = signed[index];
      if (resolved) resolvedByUrl.set(url, resolved);
    });

    return trimmed.map(({ shelf, books }) => ({
      id: shelf.id,
      name: shelf.name,
      cover_color: shelf.cover_color,
      shelf_style: shelf.shelf_style,
      books: books.map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        image_url: b.image_url,
        resolved_image_url: b.image_url
          ? resolvedByUrl.get(b.image_url) ?? null
          : null,
      })),
    }));
  }

  /**
   * Transform a single bookshelf to widget-compatible format.
   */
  async transformBookshelfForWidget(
    bookshelf: Bookshelf,
    books: Book[]
  ): Promise<WidgetBookshelf> {
    const reusable = await this.loadReusableUrls();
    const [widgetShelf] = await this.transformBookshelvesForWidget(
      [{ ...bookshelf, books }],
      reusable
    );
    return widgetShelf;
  }

  /**
   * Persist the snapshot and push it to the native widget. Callers must hold
   * the write queue (see `enqueueWrite`).
   */
  private async persistWidgetData(bookshelves: WidgetBookshelf[]): Promise<void> {
    const now = new Date().toISOString();
    const widgetData: WidgetData = {
      bookshelves,
      lastUpdated: now,
      resolvedAt: now,
    };

    await AsyncStorage.setItem(WIDGET_DATA_KEY, JSON.stringify(widgetData));
    const isPremium = await this.getIsPremium();
    pushToWidget(widgetData, isPremium);
  }

  /**
   * Save widget data for the home screen widget.
   * Writes to AsyncStorage (for the app) and pushes to the native widget
   * via expo-widgets updateSnapshot.
   */
  async saveWidgetData(bookshelves: WidgetBookshelf[]): Promise<void> {
    try {
      await this.enqueueWrite(() => this.persistWidgetData(bookshelves));
    } catch (error) {
      console.error('Failed to save widget data:', error);
    }
  }

  /**
   * Pushes all shelf snapshots to the widget so the configurable intent
   * can let the user pick any shelf.
   */
  async syncLibrarySnapshot(
    shelves: (Bookshelf & { books: Book[] })[]
  ): Promise<void> {
    try {
      // Resolve outside the write queue: signing is the slow part and holding
      // the queue across it would stall unrelated widget writes.
      const reusable = await this.loadReusableUrls();
      const widgetShelves = await this.transformBookshelvesForWidget(
        shelves,
        reusable
      );

      // The library fetch is authoritative for which shelves exist, so this
      // replaces the snapshot outright — deleted shelves drop out of the
      // widget's picker instead of lingering forever.
      await this.enqueueWrite(() => this.persistWidgetData(widgetShelves));
    } catch (error) {
      console.error('Failed syncing widget library snapshot:', error);
    }
  }

  /**
   * Reload all widget timelines.
   * With expo-widgets this is handled automatically via updateSnapshot,
   * but we keep the method for API compatibility with existing callers.
   */
  reloadWidgetTimelines(): void {
    // expo-widgets handles timeline reloads internally via updateSnapshot.
    // This is now a no-op kept for backward compatibility.
  }

  /**
   * Get current widget data from local cache
   */
  async getWidgetData(): Promise<WidgetData | null> {
    try {
      const data = await AsyncStorage.getItem(WIDGET_DATA_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get widget data:', error);
      return null;
    }
  }

  /**
   * Set the selected bookshelf for the widget
   */
  async setSelectedWidgetShelf(shelfId: string): Promise<void> {
    try {
      await AsyncStorage.setItem(WIDGET_SELECTED_SHELF_KEY, shelfId);
    } catch (error) {
      console.error('Failed to set widget shelf:', error);
    }
  }

  /**
   * Get the selected bookshelf ID for the widget
   */
  async getSelectedWidgetShelf(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(WIDGET_SELECTED_SHELF_KEY);
    } catch (error) {
      console.error('Failed to get widget shelf:', error);
      return null;
    }
  }

  /**
   * Update widget with a specific bookshelf
   */
  async updateWidgetWithBookshelf(
    bookshelf: Bookshelf,
    books: Book[]
  ): Promise<void> {
    try {
      // Resolve before taking the queue — see syncLibrarySnapshot.
      const widgetBookshelf = await this.transformBookshelfForWidget(bookshelf, books);

      // Read and write under the queue so a concurrent library sync can't land
      // between them and drop this shelf's update.
      await this.enqueueWrite(async () => {
        const existing = await this.getWidgetData();
        const bookshelves = existing?.bookshelves ?? [];
        const idx = bookshelves.findIndex((s) => s.id === widgetBookshelf.id);
        if (idx >= 0) {
          bookshelves[idx] = widgetBookshelf;
        } else {
          bookshelves.push(widgetBookshelf);
        }
        await this.persistWidgetData(bookshelves.slice(0, MAX_WIDGET_SHELVES));
      });

      await this.setSelectedWidgetShelf(bookshelf.id);
    } catch (error) {
      console.error('Failed to update widget bookshelf:', error);
    }
  }

  /**
   * Drop a deleted bookshelf from the widget snapshot so it stops appearing in
   * the widget's shelf picker before the next library refresh.
   */
  async removeBookshelfFromWidget(bookshelfId: string): Promise<void> {
    try {
      await this.enqueueWrite(async () => {
        const existing = await this.getWidgetData();
        if (!existing) return;

        const remaining = existing.bookshelves.filter((s) => s.id !== bookshelfId);
        if (remaining.length === existing.bookshelves.length) return;

        await this.persistWidgetData(remaining);
      });
    } catch (error) {
      console.error('Failed to remove bookshelf from widget:', error);
    }
  }

  /**
   * Clear widget data
   */
  async clearWidgetData(): Promise<void> {
    try {
      // Under the write queue so an in-flight sync can't repopulate the
      // snapshot after sign-out has cleared it.
      await this.enqueueWrite(async () => {
        this._isPremiumCached = null;
        await AsyncStorage.multiRemove([
          WIDGET_DATA_KEY,
          WIDGET_SELECTED_SHELF_KEY,
          WIDGET_PREMIUM_KEY,
        ]);

        // Push empty state to widget
        pushToWidget({ bookshelves: [], lastUpdated: new Date().toISOString() }, false);
      });
    } catch (error) {
      console.error('Failed to clear widget data:', error);
    }
  }

  /**
   * Store the user's premium status locally so it can be included
   * when pushing data to the native widget.
   */
  async setIsPremium(isPremium: boolean): Promise<void> {
    // Update the in-memory cache synchronously so subsequent reads within the
    // same tick (e.g. from syncLibrarySnapshot) see the correct value.
    this._isPremiumCached = isPremium;
    try {
      await AsyncStorage.setItem(WIDGET_PREMIUM_KEY, JSON.stringify(isPremium));
    } catch (error) {
      console.error('Failed to save widget premium status:', error);
    }
  }

  /**
   * Read the cached premium status.
   * Returns `null` when the status has never been explicitly set
   * (so callers can distinguish "unknown" from "definitely free").
   */
  async getIsPremium(): Promise<boolean> {
    // Prefer the in-memory cache to avoid reading a stale AsyncStorage value
    // when setIsPremium was called but hasn't flushed yet.
    if (this._isPremiumCached !== null) {
      return this._isPremiumCached;
    }
    try {
      const value = await AsyncStorage.getItem(WIDGET_PREMIUM_KEY);
      if (value !== null) {
        const result = JSON.parse(value) === true;
        this._isPremiumCached = result;
        return result;
      }
      // Premium status has never been set — default to true so the widget
      // shows shelf content until RevenueCat resolves.  syncPremiumStatus
      // will push the authoritative value once it runs.
      return true;
    } catch {
      return true;
    }
  }

  /**
   * Sync the premium flag and re-push existing widget data so the
   * widget immediately reflects the subscription change.
   */
  async syncPremiumStatus(isPremium: boolean): Promise<void> {
    await this.setIsPremium(isPremium);
    const widgetData = await this.getWidgetData();
    if (widgetData) {
      pushToWidget(widgetData, isPremium);
    } else {
      pushToWidget({ bookshelves: [], lastUpdated: new Date().toISOString() }, isPremium);
    }
  }

  // Widget taps deep-link via widgetURL (tinyshelves://bookshelf?id=...),
  // which expo-router resolves to the bookshelf detail screen automatically —
  // no JS-side URL parsing is needed.
}

export const widgetManager = new WidgetManager();

export default widgetManager;
