/**
 * Widget Utilities
 *
 * Utilities for managing iOS home screen widget data.
 *
 * iOS Widget Implementation Notes:
 * --------------------------------
 * Expo's widget support is still experimental. For a production widget, you'll need to:
 *
 * 1. Create a native iOS Widget Extension (Swift/SwiftUI)
 * 2. Use App Groups to share data between the main app and widget
 * 3. Store widget data using UserDefaults in the shared App Group
 *
 * This file provides utilities to:
 * - Prepare widget data
 * - Update widget through shared storage
 * - Handle widget deep links
 *
 * Setup Steps:
 * 1. In Xcode, add a Widget Extension target to your project
 * 2. Create an App Group (e.g., "group.com.yourcompany.virtuallibrary")
 * 3. Enable App Groups capability for both the main app and widget
 * 4. Use SharedUserDefaults to store/read bookshelf data
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetData, WidgetBookshelf, WidgetBook, Bookshelf, Book } from '@/types';

// Keys for widget storage
const WIDGET_DATA_KEY = '@virtual_library_widget_data';
const WIDGET_SELECTED_SHELF_KEY = '@virtual_library_widget_shelf';

/**
 * Widget Manager Class
 * Handles all widget-related data operations
 */
class WidgetManager {
  /**
   * Transform a bookshelf to widget-compatible format
   * Widget needs minimal data to keep size small
   */
  transformBookshelfForWidget(
    bookshelf: Bookshelf,
    books: Book[]
  ): WidgetBookshelf {
    return {
      id: bookshelf.id,
      name: bookshelf.name,
      books: books.slice(0, 6).map(this.transformBookForWidget), // Max 6 books for widget
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
   * In production, this should write to UserDefaults in App Group
   */
  async saveWidgetData(bookshelf: WidgetBookshelf | null): Promise<void> {
    try {
      const widgetData: WidgetData = {
        bookshelf,
        lastUpdated: new Date().toISOString(),
      };

      await AsyncStorage.setItem(WIDGET_DATA_KEY, JSON.stringify(widgetData));

      // In production with native widget:
      // 1. Write to UserDefaults in shared App Group
      // 2. Call WidgetKit.WidgetCenter.shared.reloadAllTimelines()
      // Example (native code needed):
      // NativeModules.WidgetBridge.updateWidget(widgetData);

      console.log('Widget data saved');
    } catch (error) {
      console.error('Failed to save widget data:', error);
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
    } catch (error) {
      console.error('Failed to clear widget data:', error);
    }
  }

  /**
   * Handle deep link from widget tap
   * Returns the route to navigate to
   */
  handleWidgetDeepLink(url: string): {
    route: string;
    params?: Record<string, string>;
  } | null {
    try {
      const urlObj = new URL(url);

      // Handle different widget actions
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

      // Default: open home
      return { route: '/(tabs)' };
    } catch (error) {
      console.error('Failed to parse widget deep link:', error);
      return null;
    }
  }
}

// Export singleton instance
export const widgetManager = new WidgetManager();

export default widgetManager;
