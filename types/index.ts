/**
 * TypeScript type definitions for the Virtual Library App
 * These types match the Supabase database schema and are used throughout the app
 */

// ============================================
// Database Types (matching Supabase schema)
// ============================================

/**
 * User profile stored in Supabase
 * Extends the auth.users table with additional profile information
 */
export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  is_premium: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Shelf display style
 * - 'bottom': shelf line only along the bottom of each row (no background)
 * - 'full': shelf line goes all the way around each row as a rectangle (with background)
 */
export type ShelfStyle = 'bottom' | 'full';

/**
 * Bookshelf - a collection of books
 * Users can have multiple bookshelves
 */
export interface Bookshelf {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  cover_color: string;
  is_public: boolean;
  shelf_style: ShelfStyle;
  position: number;
  created_at: string;
  updated_at: string;
}

/**
 * DbBook - a global book record shared across all users.
 * Contains only the book's intrinsic data (title, author, spine image, etc.)
 */
export interface DbBook {
  id: string;
  title: string;
  author: string;
  image_url: string | null;
  cover_image_url: string | null;
  uploaded_by_user_id: string;
  is_community: boolean;
  isbn: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * BookshelfItem - per-user placement of a book on a shelf.
 * Stores shelf position, review, rating, and stack state.
 */
export interface BookshelfItem {
  id: string;
  book_id: string;
  shelf_id: string;
  position: number;
  review: string | null;
  rating: number | null;
  is_stacked: boolean;
  stack_id: string | null;
  stack_position: number;
  created_at: string;
  updated_at: string;
}

/**
 * Book - combined view used throughout the UI.
 * Merges global book data with per-user bookshelf placement.
 * `id` is the bookshelf_items.id (unique per user-shelf placement).
 * `book_id` is the books.id (global, shared across users).
 */
export interface Book {
  id: string;           // bookshelf_items.id
  book_id: string;      // books.id (global book reference)
  title: string;
  author: string;
  image_url: string | null;
  cover_image_url: string | null;
  shelf_id: string;
  position: number;
  review: string | null;
  rating: number | null;
  uploaded_by_user_id: string;
  is_community: boolean;
  isbn: string | null;
  is_stacked: boolean;
  stack_id: string | null;
  stack_position: number;
  created_at: string;
  updated_at: string;
}

/**
 * Community book spine - available for all users to add to their shelves
 */
export interface CommunityBookSpine {
  id: string;
  title: string;
  author: string;
  image_url: string;
  uploaded_by_user_id: string;
  uploader_name: string | null;
  times_added: number;
  created_at: string;
}

/**
 * Public user profile - used when viewing another user's profile
 */
export interface PublicUserProfile {
  id: string;
  name: string | null;
  bookshelves: (Bookshelf & { books: Book[] })[];
}

// ============================================
// Input Types (for creating/updating records)
// ============================================

export interface CreateUserInput {
  email: string;
  name?: string;
}

export interface UpdateUserInput {
  name?: string;
  avatar_url?: string;
  is_premium?: boolean;
}

export interface CreateBookshelfInput {
  name: string;
  description?: string;
  cover_color?: string;
  is_public?: boolean;
  shelf_style?: ShelfStyle;
}

export interface UpdateBookshelfInput {
  name?: string;
  description?: string;
  cover_color?: string;
  is_public?: boolean;
  shelf_style?: ShelfStyle;
  position?: number;
}

export interface CreateBookInput {
  title: string;
  author: string;
  image_url?: string;
  shelf_id: string;
  position?: number;
  review?: string;
  rating?: number;
  isbn?: string;
  is_community?: boolean;
  is_stacked?: boolean;
  stack_id?: string;
  stack_position?: number;
  /** Optionally reference an existing global book instead of creating a new one */
  book_id?: string;
}

export interface UpdateBookInput {
  title?: string;
  author?: string;
  image_url?: string;
  cover_image_url?: string | null;
  shelf_id?: string;
  position?: number;
  review?: string | null;
  rating?: number | null;
  isbn?: string;
  is_stacked?: boolean;
  stack_id?: string | null;
  stack_position?: number;
}

// ============================================
// Auth Types
// ============================================

export interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: {
    id: string;
    email: string;
  };
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  name: string;
}

// ============================================
// Navigation Types (for Expo Router)
// ============================================

export type RootStackParamList = {
  '(auth)/login': undefined;
  '(auth)/register': undefined;
  '(tabs)': undefined;
  'bookshelf/[id]': { id: string };
  'book/[id]': { id: string; shelfId: string };
  'user/[id]': { id: string };
  'scan': { shelfId: string };
  'community': undefined;
  'payment': undefined;
};

// ============================================
// Component Props Types
// ============================================

export interface BookSpineProps {
  book: Book;
  onPress: (book: Book) => void;
  width?: number;
  height?: number;
}

export interface BookshelfPreviewProps {
  bookshelf: Bookshelf;
  books: Book[];
  onPress: (bookshelf: Bookshelf) => void;
  onDelete?: (bookshelf: Bookshelf) => void;
}

export interface BookshelfGridProps {
  books: Book[];
  onBookPress: (book: Book) => void;
  onAddBook: () => void;
  isLoading?: boolean;
}

export interface CommunityBookItemProps {
  book: CommunityBookSpine;
  onAddToShelf: (book: CommunityBookSpine) => void;
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================
// Payment Types (Stripe)
// ============================================

export interface PaymentIntent {
  id: string;
  client_secret: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
}

export type PaymentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'canceled'
  | 'succeeded';

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'canceled' | 'past_due';
  current_period_end: string;
  created_at: string;
}

// ============================================
// Widget Types (iOS Widget)
// ============================================

export interface WidgetBookshelf {
  id: string;
  name: string;
  books: WidgetBook[];
}

export interface WidgetBook {
  id: string;
  title: string;
  author: string;
  image_url: string | null;
}

export interface WidgetData {
  bookshelf: WidgetBookshelf | null;
  lastUpdated: string;
}

// ============================================
// Utility Types
// ============================================

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

// Color palette for bookshelf covers
export const BOOKSHELF_COLORS = [
  '#8B4513', // Saddle Brown (wood)
  '#A0522D', // Sienna
  '#D2691E', // Chocolate
  '#CD853F', // Peru
  '#DEB887', // Burlywood
  '#2F4F4F', // Dark Slate Gray
  '#4A4A4A', // Dark Gray
  '#1a1a2e', // Dark Navy
  '#16213e', // Navy Blue
  '#0f3460', // Deep Blue
] as const;

export type BookshelfColor = typeof BOOKSHELF_COLORS[number];
