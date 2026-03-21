/**
 * Widget Utilities
 *
 * Utilities for managing iOS home screen widget data.
 * Uses expo-widgets (Expo SDK 55) — data is pushed to the widget via
 * BookshelfWidget.updateSnapshot(), replacing the previous native bridge.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { WidgetData, WidgetBookshelf, WidgetBook, Bookshelf, Book } from '@/types';

const noopWidget = {
  updateSnapshot(_data: unknown) {},
};

function getBookshelfWidget(): { updateSnapshot(data: unknown): void } {
  // Lazy-load to avoid pulling @expo/ui/swift-ui into the main app bundle
  // where the ExpoUI native module is not available.
  try {
    const mod = require('@/widgets/BookshelfWidget');
    return mod?.default ?? noopWidget;
  } catch {
    // ExpoUI native module is only available inside the widget extension.
    // In the main app process we fall back to a no-op; the widget will read
    // from shared storage (AsyncStorage) when it renders.
    return noopWidget;
  }
}

const WIDGET_DATA_KEY = '@virtual_library_widget_data';
const WIDGET_SELECTED_SHELF_KEY = '@virtual_library_widget_shelf';

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
   * Save widget data and push to the home screen widget via updateSnapshot.
   */
  async saveWidgetData(bookshelf: WidgetBookshelf | null): Promise<void> {
    try {
      const widgetData: WidgetData = {
        bookshelf,
        lastUpdated: new Date().toISOString(),
      };

      await AsyncStorage.setItem(WIDGET_DATA_KEY, JSON.stringify(widgetData));

      if (Platform.OS === 'ios') {
        getBookshelfWidget().updateSnapshot({
          shelfId: bookshelf?.id ?? null,
          shelfName: bookshelf?.name ?? null,
          books: bookshelf?.books ?? [],
        });
      }
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

      if (Platform.OS === 'ios') {
        getBookshelfWidget().updateSnapshot({
          shelfId: widgetShelf.id,
          shelfName: widgetShelf.name,
          books: widgetShelf.books,
        });
      }
    } catch (error) {
      console.error('Failed syncing widget library snapshot:', error);
    }
  }

  /**
   * No-op: expo-widgets reloads the timeline automatically after updateSnapshot.
   * Retained for call-site compatibility.
   */
  reloadWidgetTimelines(): void {}

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
      if (Platform.OS === 'ios') {
        getBookshelfWidget().updateSnapshot({
          shelfId: null,
          shelfName: null,
          books: [],
        });
      }
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

      if (urlObj.pathname.includes('bookshelf')) {
        const shelfId = urlObj.searchParams.get('id');
        if (shelfId) {
          return {
            route: '/bookshelf/[id]',
            params: { id: shelfId },
          };
        }
      }

      if (urlObj.pathname.includes('book')) {
        const bookId = urlObj.searchParams.get('id');
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
