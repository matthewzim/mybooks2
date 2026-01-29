/**
 * Theme Context
 *
 * Provides theme state and methods throughout the app.
 * Handles theme persistence using AsyncStorage.
 *
 * Usage:
 * import { useTheme } from '@/contexts/ThemeContext';
 *
 * function MyComponent() {
 *   const { colors, theme, setTheme } = useTheme();
 *   // ...
 * }
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ThemeType,
  ThemeColors,
  Themes,
  LightTheme,
} from '@/constants/theme';

const THEME_STORAGE_KEY = '@mybooks_theme';

/**
 * Theme context type definition
 */
interface ThemeContextType {
  // Current theme type
  theme: ThemeType;
  // Current theme colors
  colors: ThemeColors;
  // Loading state
  isLoading: boolean;
  // Method to change theme
  setTheme: (theme: ThemeType) => Promise<void>;
}

// Create context with undefined default
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Theme Provider Component
 *
 * Wraps the app to provide theme state and methods.
 * Automatically restores theme preference on app start.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeType>('light');
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Initialize theme from storage on mount
   */
  useEffect(() => {
    loadTheme();
  }, []);

  /**
   * Load theme preference from AsyncStorage
   */
  const loadTheme = async () => {
    try {
      const storedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'standard')) {
        setThemeState(storedTheme as ThemeType);
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Set and persist theme preference
   */
  const setTheme = useCallback(async (newTheme: ThemeType) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
      setThemeState(newTheme);
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  }, []);

  /**
   * Get current theme colors
   */
  const colors = useMemo<ThemeColors>(() => {
    return Themes[theme] || LightTheme;
  }, [theme]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo<ThemeContextType>(
    () => ({
      theme,
      colors,
      isLoading,
      setTheme,
    }),
    [theme, colors, isLoading, setTheme]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Custom hook to use theme context
 * Throws error if used outside ThemeProvider
 */
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}

export default ThemeContext;
