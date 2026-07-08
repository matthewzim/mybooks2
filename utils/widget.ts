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
  if (Platform.OS === 'ios') {
    try {
      Settings.set({
        '__expo_widgets_BookshelfWidget_timeline': [payload],
        'BookshelfWidget_timeline': [payload],
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
   * Transform a bookshelf to widget-compatible format.
   * Resolves spine image URLs so the native widget can download them.
   *
   * The book-spines bucket is private, so the widget needs long-lived signed
   * URLs — plain public URLs return 400 and every spine falls back to a
   * lettered placeholder. All spine paths for the shelf are signed in one
   * batched request.
   */
  async transformBookshelfForWidget(
    bookshelf: Bookshelf,
    books: Book[]
  ): Promise<WidgetBookshelf> {
    const sorted = books
      .slice()
      .sort((a, b) => a.position - b.position)
      .slice(0, 18);

    const resolvedUrls = await getSpineWidgetUrls(sorted.map((b) => b.image_url));

    const widgetBooks = sorted.map((b, i) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      image_url: b.image_url,
      resolved_image_url: resolvedUrls[i],
    }));

    return {
      id: bookshelf.id,
      name: bookshelf.name,
      cover_color: bookshelf.cover_color,
      shelf_style: bookshelf.shelf_style,
      books: widgetBooks,
    };
  }

  /**
   * Save widget data for the home screen widget.
   * Writes to AsyncStorage (for the app) and pushes to the native widget
   * via expo-widgets updateSnapshot.
   */
  async saveWidgetData(bookshelves: WidgetBookshelf[]): Promise<void> {
    try {
      const widgetData: WidgetData = {
        bookshelves,
        lastUpdated: new Date().toISOString(),
      };

      await AsyncStorage.setItem(WIDGET_DATA_KEY, JSON.stringify(widgetData));
      const isPremium = await this.getIsPremium();
      pushToWidget(widgetData, isPremium);
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
      const widgetShelves = await Promise.all(
        shelves.map((shelf) =>
          this.transformBookshelfForWidget(shelf, shelf.books)
        )
      );

      const widgetData: WidgetData = {
        bookshelves: widgetShelves,
        lastUpdated: new Date().toISOString(),
      };

      await AsyncStorage.setItem(WIDGET_DATA_KEY, JSON.stringify(widgetData));
      const isPremium = await this.getIsPremium();
      pushToWidget(widgetData, isPremium);
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
    const widgetBookshelf = await this.transformBookshelfForWidget(bookshelf, books);
    // Re-save with this shelf included (merge with existing data)
    const existing = await this.getWidgetData();
    const bookshelves = existing?.bookshelves ?? [];
    const idx = bookshelves.findIndex((s) => s.id === widgetBookshelf.id);
    if (idx >= 0) {
      bookshelves[idx] = widgetBookshelf;
    } else {
      bookshelves.push(widgetBookshelf);
    }
    await this.saveWidgetData(bookshelves);
    await this.setSelectedWidgetShelf(bookshelf.id);
  }

  /**
   * Clear widget data
   */
  async clearWidgetData(): Promise<void> {
    try {
      this._isPremiumCached = null;
      await AsyncStorage.removeItem(WIDGET_DATA_KEY);
      await AsyncStorage.removeItem(WIDGET_SELECTED_SHELF_KEY);
      await AsyncStorage.removeItem(WIDGET_PREMIUM_KEY);

      // Push empty state to widget
      pushToWidget({ bookshelves: [], lastUpdated: new Date().toISOString() }, false);
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
