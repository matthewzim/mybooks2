/**
 * Widget Utilities
 *
 * Utilities for managing iOS home screen widget data.
 * Supports a native Swift WidgetExtension through an App Group container.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import type { WidgetData, WidgetBookshelf, WidgetBook, Bookshelf, Book } from '@/types';

// Keys for JS fallback storage
const WIDGET_DATA_KEY = '@virtual_library_widget_data';
const WIDGET_SELECTED_SHELF_KEY = '@virtual_library_widget_shelf';

const WIDGET_APP_GROUP = 'group.com.virtualibrary.mybooks';

interface WidgetBridge {
  updateWidgetData: (payload: string) => void;
  setSelectedShelf: (shelfId: string) => void;
  reloadTimelines: () => void;
}

const widgetBridge: WidgetBridge | null =
  Platform.OS === 'ios' && NativeModules.VirtualLibraryWidgetBridge
    ? (NativeModules.VirtualLibraryWidgetBridge as WidgetBridge)
    : null;

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
   * Save widget data to shared storage
   */
  async saveWidgetData(bookshelf: WidgetBookshelf | null): Promise<void> {
    try {
      const widgetData: WidgetData = {
        bookshelf,
        lastUpdated: new Date().toISOString(),
      };

      await AsyncStorage.setItem(WIDGET_DATA_KEY, JSON.stringify(widgetData));

      if (widgetBridge) {
        widgetBridge.updateWidgetData(
          JSON.stringify({
            appGroup: WIDGET_APP_GROUP,
            selectedShelfId: bookshelf?.id ?? null,
            shelves: bookshelf ? [bookshelf] : [],
            lastUpdated: widgetData.lastUpdated,
          })
        );
      }
    } catch (error) {
      console.error('Failed to save widget data:', error);
    }
  }

  /**
   * Pushes a complete shelf list snapshot for configurable widget shelf selection.
   */
  async syncLibrarySnapshot(
    shelves: (Bookshelf & { books: Book[] })[]
  ): Promise<void> {
    try {
      const widgetShelves = shelves.map((shelf) =>
        this.transformBookshelfForWidget(shelf, shelf.books)
      );

      const selectedShelfId = await this.getSelectedWidgetShelf();

      if (widgetBridge) {
        widgetBridge.updateWidgetData(
          JSON.stringify({
            appGroup: WIDGET_APP_GROUP,
            selectedShelfId,
            shelves: widgetShelves,
            lastUpdated: new Date().toISOString(),
          })
        );
      }
    } catch (error) {
      console.error('Failed syncing widget library snapshot:', error);
    }
  }

  /**
   * Request timeline reload when shelf books are updated.
   */
  reloadWidgetTimelines(): void {
    if (widgetBridge) {
      widgetBridge.reloadTimelines();
    }
  }

  /**
   * Get current widget data
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
      if (widgetBridge) {
        widgetBridge.setSelectedShelf(shelfId);
      }
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
    this.reloadWidgetTimelines();
  }

  /**
   * Clear widget data
   */
  async clearWidgetData(): Promise<void> {
    try {
      await AsyncStorage.removeItem(WIDGET_DATA_KEY);
      await AsyncStorage.removeItem(WIDGET_SELECTED_SHELF_KEY);
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
