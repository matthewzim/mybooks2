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
import { Platform } from 'react-native';
import type { WidgetData, WidgetBookshelf, WidgetBook, Bookshelf, Book } from '@/types';

const WIDGET_DATA_KEY = '@virtual_library_widget_data';
const WIDGET_SELECTED_SHELF_KEY = '@virtual_library_widget_shelf';
const WIDGET_PREMIUM_KEY = '@virtual_library_widget_premium';

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

  widget.updateSnapshot({
    isPremium,
    bookshelves: widgetData.bookshelves.map((shelf) => ({
      id: shelf.id,
      name: shelf.name,
      books: shelf.books.map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        imageUrl: b.image_url,
      })),
    })),
  });
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
   * Transform a bookshelf to widget-compatible format
   */
  transformBookshelfForWidget(
    bookshelf: Bookshelf,
    books: Book[]
  ): WidgetBookshelf {
    return {
      id: bookshelf.id,
      name: bookshelf.name,
      books: books
        .slice()
        .sort((a, b) => a.position - b.position)
        .slice(0, 18)
        .map(this.transformBookForWidget),
    };
  }

  /**
   * Transform a book to widget-compatible format
   */
  transformBookForWidget(book: Book): WidgetBook {
    return {
      id: book.id,
      title: book.title,
      author: book.author,
      image_url: book.image_url,
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
      const widgetShelves = shelves.map((shelf) =>
        this.transformBookshelfForWidget(shelf, shelf.books)
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
    const widgetBookshelf = this.transformBookshelfForWidget(bookshelf, books);
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
   */
  async getIsPremium(): Promise<boolean> {
    // Prefer the in-memory cache to avoid reading a stale AsyncStorage value
    // when setIsPremium was called but hasn't flushed yet.
    if (this._isPremiumCached !== null) {
      return this._isPremiumCached;
    }
    try {
      const value = await AsyncStorage.getItem(WIDGET_PREMIUM_KEY);
      const result = value ? JSON.parse(value) === true : false;
      this._isPremiumCached = result;
      return result;
    } catch {
      return false;
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

  /**
   * Handle deep link from widget tap
   */
  handleWidgetDeepLink(url: string): {
    route: string;
    params?: Record<string, string>;
  } | null {
    try {
      const urlObj = new URL(url);

      const bookshelfPath = `${urlObj.hostname}${urlObj.pathname}`;

      if (bookshelfPath.includes('bookshelf')) {
        const shelfId =
          urlObj.searchParams.get('id') ??
          bookshelfPath.split('/').filter(Boolean).at(-1) ??
          null;
        if (shelfId) {
          return {
            route: '/bookshelf',
            params: { id: shelfId },
          };
        }
      }

      if (bookshelfPath.includes('book')) {
        const bookId =
          urlObj.searchParams.get('id') ??
          bookshelfPath.split('/').filter(Boolean).at(-1) ??
          null;
        const shelfId = urlObj.searchParams.get('shelfId');
        if (bookId) {
          return {
            route: '/book/[id]',
            params: { id: bookId, shelfId: shelfId || '' },
          };
        }
      }

      return { route: '/(tabs)' };
    } catch (error) {
      console.error('Failed to parse widget deep link:', error);
      return null;
    }
  }
}

export const widgetManager = new WidgetManager();

export default widgetManager;
