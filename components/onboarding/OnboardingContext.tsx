/**
 * Onboarding Context
 *
 * Local state management for the onboarding flow.
 * Drives the live preview and persists selections across steps.
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ShelfStyle } from '@/types';
import { BOOKSHELF_COLORS } from '@/types';
import { BookSpine as BookSpineConstants } from '@/constants/theme';

export type OnboardingStep = 'welcome' | 'style' | 'populate' | 'layout' | 'name' | 'reveal';

export type LayoutMode = 'color' | 'genre' | 'rating' | 'random';

export interface PreviewBook {
  id: string;
  title: string;
  author: string;
  color: string;
  genre?: string;
  rating?: number;
}

interface OnboardingState {
  step: OnboardingStep;
  shelfStyle: ShelfStyle;
  shelfColor: string;
  books: PreviewBook[];
  layoutMode: LayoutMode;
  shelfName: string;
}

interface OnboardingContextType extends OnboardingState {
  setStep: (step: OnboardingStep) => void;
  setShelfStyle: (style: ShelfStyle) => void;
  setShelfColor: (color: string) => void;
  setBooks: (books: PreviewBook[]) => void;
  addBooks: (books: PreviewBook[]) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setShelfName: (name: string) => void;
  stepIndex: number;
  totalSteps: number;
}

const STEPS: OnboardingStep[] = ['welcome', 'style', 'populate', 'layout', 'name', 'reveal'];

function getBookColor(title: string): string {
  const colors = BookSpineConstants.colors;
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const SAMPLE_BOOKS: PreviewBook[] = [
  { id: 's1', title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', color: getBookColor('The Great Gatsby'), genre: 'fiction', rating: 5 },
  { id: 's2', title: '1984', author: 'George Orwell', color: getBookColor('1984'), genre: 'fiction', rating: 5 },
  { id: 's3', title: 'To Kill a Mockingbird', author: 'Harper Lee', color: getBookColor('To Kill a Mockingbird'), genre: 'fiction', rating: 4 },
  { id: 's4', title: 'Sapiens', author: 'Yuval Noah Harari', color: getBookColor('Sapiens'), genre: 'nonfiction', rating: 4 },
  { id: 's5', title: 'Dune', author: 'Frank Herbert', color: getBookColor('Dune'), genre: 'scifi', rating: 5 },
  { id: 's6', title: 'Pride and Prejudice', author: 'Jane Austen', color: getBookColor('Pride and Prejudice'), genre: 'fiction', rating: 4 },
  { id: 's7', title: 'Atomic Habits', author: 'James Clear', color: getBookColor('Atomic Habits'), genre: 'nonfiction', rating: 4 },
  { id: 's8', title: 'The Hobbit', author: 'J.R.R. Tolkien', color: getBookColor('The Hobbit'), genre: 'fantasy', rating: 5 },
];

export { SAMPLE_BOOKS };

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [shelfStyle, setShelfStyle] = useState<ShelfStyle>('full');
  const [shelfColor, setShelfColor] = useState<string>(BOOKSHELF_COLORS[0]);
  const [books, setBooks] = useState<PreviewBook[]>([]);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('color');
  const [shelfName, setShelfName] = useState<string>('');

  const addBooks = useCallback((newBooks: PreviewBook[]) => {
    setBooks(prev => {
      const existingIds = new Set(prev.map(b => b.id));
      const uniqueNew = newBooks.filter(b => !existingIds.has(b.id));
      return [...prev, ...uniqueNew];
    });
  }, []);

  const stepIndex = STEPS.indexOf(step);
  const totalSteps = STEPS.length;

  const value = useMemo<OnboardingContextType>(() => ({
    step,
    shelfStyle,
    shelfColor,
    books,
    layoutMode,
    shelfName,
    setStep,
    setShelfStyle,
    setShelfColor,
    setBooks,
    addBooks,
    setLayoutMode,
    setShelfName,
    stepIndex,
    totalSteps,
  }), [step, shelfStyle, shelfColor, books, layoutMode, shelfName, addBooks, stepIndex, totalSteps]);

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextType {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
