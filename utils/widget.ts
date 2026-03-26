/**
 * Widget Utilities
 *
 * Utilities for managing iOS home screen widget data.
 * Uses expo-widgets to share data with the widget via updateSnapshot.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { WidgetData, WidgetBookshelf, WidgetBook, Bookshelf, Book } from '@/types';

const WIDGET_DATA_KEY = '@virtual_library_widget_data';
const WIDGET_SELECTED_SHELF_KEY = '@virtual_library_widget_shelf';

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
 * Push data to the native widget via expo-widgets updateSnapshot.
 */
function pushToWidget(widgetData: WidgetData): void {
  const widget = getBookshelfWidget();
  if (!widget) return;

  const bookshelf = widgetData.bookshelf;
  widget.updateSnapshot({
    bookshelfName: bookshelf?.name ?? null,
    bookshelfId: bookshelf?.id ?? null,
    books: (bookshelf?.books ?? []).map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      imageUrl: b.image_url,
    })),
  });
}

/**
 * Widget Manager Class
 * Handles all widget-related data operations
 */
class WidgetManager {
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
  async saveWidgetData(bookshelf: WidgetBookshelf | null): Promise<void> {
    try {
      const widgetData: WidgetData = {
        bookshelf,
        lastUpdated: new Date().toISOString(),
      };

      await AsyncStorage.setItem(WIDGET_DATA_KEY, JSON.stringify(widgetData));
      pushToWidget(widgetData);
    } catch (error) {
      console.error('Failed to save widget data:', error);
    }
  }

  /**
   * Pushes the currently selected shelf snapshot to the widget.
   */
  async syncLibrarySnapshot(
    shelves: (Bookshelf & { books: Book[] })[]
  ): Promise<void> {
    try {
      const selectedShelfId = await this.getSelectedWidgetShelf();
      const activeShelf =
        shelves.find((s) => s.id === selectedShelfId) ?? shelves[0];

      if (!activeShelf) return;

      const widgetShelf = this.transformBookshelfForWidget(
        activeShelf,
        activeShelf.books
      );

      const widgetData: WidgetData = {
        bookshelf: widgetShelf,
        lastUpdated: new Date().toISOString(),
      };

      pushToWidget(widgetData);
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
    await this.saveWidgetData(widgetBookshelf);
    await this.setSelectedWidgetShelf(bookshelf.id);
  }

  /**
   * Clear widget data
   */
  async clearWidgetData(): Promise<void> {
    try {
      await AsyncStorage.removeItem(WIDGET_DATA_KEY);
      await AsyncStorage.removeItem(WIDGET_SELECTED_SHELF_KEY);

      // Push empty state to widget
      pushToWidget({ bookshelf: null, lastUpdated: new Date().toISOString() });
    } catch (error) {
      console.error('Failed to clear widget data:', error);
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
