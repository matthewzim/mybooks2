# Virtual Library — Comprehensive Project Prompt

## Overview

Build **Virtual Library**, a React Native (Expo) mobile application for creating, managing, and sharing personal book collections. Users organize books into customizable virtual bookshelves, scan book spines with their camera, browse community-shared libraries, write reviews, and display their favorite shelf on their iOS home screen via a native widget. The app uses anonymous authentication (no email required), Supabase as the backend, Stripe for premium subscriptions, and supports light/dark theming throughout.

---

## Tech Stack

- **Framework**: React Native with Expo SDK 55, TypeScript
- **Routing**: Expo Router (file-based routing with tabs, modals, and dynamic segments)
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Row-Level Security, Realtime)
- **Payments**: Stripe (subscription billing with payment sheet UI)
- **OCR**: Google Cloud Vision API (extract text from book spine images)
- **Widget**: expo-widgets (iOS home screen widget)
- **State Management**: React Context API + custom hooks
- **Storage**: AsyncStorage for local preferences and caching
- **Testing**: Jest
- **Linting**: ESLint
- **Platform targets**: iOS (primary), Android, Web

---

## Authentication & User Management

- **Anonymous sign-in**: Users authenticate automatically without providing email or password. On first launch, create an anonymous Supabase auth session and persist it across app restarts.
- **Auto-generated profiles**: On account creation, generate a random bookish display name (e.g., "Curious Librarian") and a unique public username (e.g., "bookworm_4729"). Store these in a `users` table.
- **Profile customization**: Allow users to update their display name, public username (with uniqueness validation), and avatar (uploaded to a Supabase storage bucket).
- **Account management**: Provide options to reset all personal data and to fully delete the account (via a server-side RPC that cascades deletion across all related tables and storage).
- **Auth state subscription**: Listen for auth state changes and keep the app's auth context in sync. Persist the session so the user stays logged in across app restarts.

---

## Bookshelf Management

- **Create bookshelves**: Users can create named bookshelves with an optional description. Free-tier users are limited to 3 shelves; premium users get unlimited.
- **Shelf customization**:
  - **Color**: Choose from 10 predefined wood-tone color palettes (e.g., natural oak, dark walnut, cherry, etc.).
  - **Style**: Two display modes — "bottom" (a shelf line beneath the books) or "full" (a rectangular background behind the books).
- **Public/private toggle**: Each shelf can be toggled between public (visible to the community) and private.
- **Ordering**: Support drag-and-drop reordering of shelves on the home screen. Persist position values in the database.
- **Editing**: Allow renaming, changing color/style, toggling visibility, and updating descriptions after creation.
- **Deletion**: Delete a shelf and cascade-remove all associated bookshelf items.

---

## Book Management

- **Add books manually**: Provide a form with fields for title, author, ISBN (optional), and an optional spine image (from camera or photo library).
- **Scan book spines**: Open a full-screen camera scanner. After capturing an image:
  1. Upload the image to Supabase storage (`book-spines` bucket).
  2. Send the image to Google Cloud Vision API for text extraction.
  3. Auto-populate title and author fields from the OCR results.
  4. Allow the user to crop/frame the spine image before saving.
- **Import from images**: Allow selecting existing photos from the device library and processing them through the same OCR + crop flow.
- **Global book registry**: Books are stored in a shared `books` table. When a user adds a book, check for existing entries to avoid duplicates. Each book has: title, author, spine image URL, cover image URL (optional), ISBN (optional), the uploading user's ID, and a community flag.
- **Community submissions**: Users can mark their book spines as community-shared, making them available for other users to browse and add to their own shelves.
- **Per-user shelf data**: The `bookshelf_items` join table tracks each user's placement of a book on a shelf, including: position, review text, star rating, stacked state, and stack grouping.

---

## Book Display & Organization

- **Shelf rows**: Render books in visual rows that mimic a real bookshelf. Book spines display as vertical images (or colored placeholders with the title if no image exists).
- **Responsive layout**: Dynamically calculate how many books fit per row based on screen width and spine image dimensions.
- **Book stacking**: Allow users to "stack" a book (rotate it flat/horizontal) for a realistic bookshelf look. Track stacked state and stack position.
- **Drag-and-drop reordering**: In edit mode, enable drag-and-drop to rearrange book positions within a shelf.
- **Quick add**: Show an "add" button on each shelf for fast access to the book addition flow.

---

## Reviews & Ratings

- **5-star rating**: Interactive star rating component on each book. Tap to set rating (1–5 stars).
- **Written reviews**: Free-text review field on the book detail screen. Reviews are per-user, per-book, per-shelf.
- **Edit and delete**: Allow modifying or clearing reviews and ratings at any time.
- **Persistence**: Store ratings and reviews in the `bookshelf_items` table.

---

## Community Features

- **Browse public shelves**: A dedicated "Explore" tab showing randomly sampled public bookshelves from other users.
- **User discovery**: Search for other users by display name or public username.
- **View user profiles**: Tap a user to see all of their public bookshelves.
- **Community book library**: Browse and search all community-shared book spines. Support paginated results and full-text search.
- **Add community books**: Select any community book and add it directly to one of your own shelves.
- **Access control**: Free users get limited community access. Premium unlocks full browsing and search.

---

## Onboarding Flow

Implement a multi-step onboarding wizard that launches on first app open (after anonymous auth). Steps:

1. **Welcome**: Introduction screen explaining the app's purpose.
2. **Style selection**: Choose shelf style ("bottom" or "full") and pick a shelf color from the palette. Show a live preview that updates in real-time.
3. **Populate**: Add initial books — either manually, by scanning, or by browsing community books.
4. **Layout preview**: Show a preview of the shelf with the selected books, style, and color.
5. **Name**: Enter a name for the first bookshelf.
6. **Reveal**: Animated reveal of the completed bookshelf with a celebratory transition.

- Support skipping individual steps.
- Persist onboarding completion state in AsyncStorage so it only shows once.
- Manage all onboarding state through a dedicated context provider.

---

## Premium Subscription (Stripe)

- **Two plans**:
  - Monthly: $4.99/month
  - Yearly: $39.99/year (~33% savings)
- **Premium features**:
  - Unlimited bookshelves (free tier limited to 3)
  - iOS home screen widget
  - Priority book scanning
  - No ads
  - Full community access
- **Payment flow**: Use Stripe's payment sheet UI. Initialize the payment sheet with the selected plan, confirm payment, and update the user's `is_premium` flag and `subscriptions` table.
- **Subscription tracking**: Store Stripe customer ID, subscription ID, plan, status, and period end date in a `subscriptions` table.
- **Real-time sync**: Keep premium status in sync between Stripe and the app.

---

## iOS Home Screen Widget

- **Widget display**: Show a single bookshelf (user's choice) on the iOS home screen, rendering the shelf background and book spine images.
- **Multiple sizes**: Support small, medium, and large widget sizes.
- **Data sync**: Whenever a shelf is updated in the app, push a snapshot of the shelf data to the widget via expo-widgets shared storage.
- **Tap to open**: Tapping the widget launches the app and navigates directly to that shelf.
- **Caching**: Persist shelf snapshots locally so the widget renders even when the app isn't running.

---

## Theming

- **Three modes**: Light, Dark, and Standard (follows system setting).
- **Persistent preference**: Save the selected theme to AsyncStorage and restore on launch.
- **Complete color system**: Define a full palette for each theme covering: primary, secondary, accent, background, surface, text (primary/secondary/tertiary), border, status colors (success, warning, error, info), and component-specific overrides.
- **Theme context**: Provide theme colors and the current mode to all components via a React context.

---

## Data Import

- **Goodreads CSV import**: On the settings screen, allow users to upload a Goodreads export CSV file. Parse it to extract book titles and authors, then bulk-create books and add them to a selected shelf.
- **Validation**: Validate CSV format and handle parsing errors gracefully.
- **Flexible mapping**: Support variations in Goodreads CSV column naming.

---

## Routing Structure

### Tab Navigation (`/(tabs)`)
| Tab | Route | Purpose |
|-----|-------|---------|
| Home | `/(tabs)/index` | Display the user's library — all shelves with book previews |
| Explore | `/(tabs)/community` | Browse public shelves, search users, discover books |
| Settings | `/(tabs)/settings` | Account management, theme, import/export, premium |

### Detail Screens
| Route | Purpose |
|-------|---------|
| `/bookshelf/[id]` | View and edit a single shelf with full book grid |
| `/book/[id]` | View and edit a single book — details, review, rating |
| `/user/[id]` | View another user's public bookshelves |

### Modal Screens
| Route | Purpose |
|-------|---------|
| `/onboarding` | Multi-step first-run wizard |
| `/scan` | Full-screen camera for spine scanning |
| `/add-book` | Manual book entry form |
| `/create-bookshelf` | New bookshelf creation form |
| `/payment` | Stripe payment UI for premium upgrade |

---

## Database Schema

### Tables

**users**
- `id` (UUID, PK, from Supabase auth)
- `name` (TEXT, nullable, auto-generated)
- `public_username` (TEXT, unique, nullable)
- `avatar_url` (TEXT, nullable)
- `is_premium` (BOOLEAN, default false)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**bookshelves**
- `id` (UUID, PK)
- `user_id` (FK → users)
- `name` (TEXT)
- `description` (TEXT, nullable)
- `cover_color` (TEXT, hex color code)
- `shelf_style` (TEXT: 'bottom' | 'full')
- `is_public` (BOOLEAN, default false)
- `position` (INTEGER, for ordering)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**books** (global, shared across users)
- `id` (UUID, PK)
- `title` (TEXT)
- `author` (TEXT)
- `image_url` (TEXT, spine image from storage)
- `cover_image_url` (TEXT, nullable)
- `uploaded_by_user_id` (FK → users)
- `is_community` (BOOLEAN, default false)
- `isbn` (TEXT, nullable)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**bookshelf_items** (per-user shelf placement)
- `id` (UUID, PK)
- `book_id` (FK → books)
- `shelf_id` (FK → bookshelves)
- `position` (INTEGER)
- `review` (TEXT, nullable)
- `rating` (INTEGER, 1–5, nullable)
- `is_stacked` (BOOLEAN, default false)
- `stack_id` (UUID, nullable)
- `stack_position` (INTEGER, nullable)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**subscriptions**
- `id` (UUID, PK)
- `user_id` (FK → users, unique)
- `stripe_customer_id` (TEXT)
- `stripe_subscription_id` (TEXT)
- `plan_id` (TEXT)
- `status` (TEXT)
- `current_period_end` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

### Views & Functions
- **community_book_spines**: View joining books with uploader info and usage count, filtered to `is_community = true`.
- **get_community_books()**: Server-side function for paginated community book search with text filtering.
- **delete_my_account**: RPC that cascades deletion across bookshelf_items, bookshelves, books (uploaded by user), subscriptions, users, and finally the auth user.

### Storage Buckets
- **book-spines**: Public bucket for spine images.
- **book-covers**: Public bucket for cover images.
- **avatars**: Public bucket for user profile photos.

### Security
- **Row-Level Security (RLS)**: Every table uses RLS policies. Users can only read/write their own data. Public bookshelves and community books are readable by all authenticated users.

---

## Service Layer Architecture

Organize all Supabase/API calls into dedicated service modules:

- **auth.ts**: Sign in, sign out, get session, get/update profile, check username availability, auth state listener.
- **bookshelves.ts**: CRUD for shelves, reorder, fetch public shelves, search users, get public user shelves.
- **books.ts**: CRUD for books, community book search/browse, reorder, stack/unstack operations.
- **storage.ts**: Upload/delete spine images, cover images, and avatars. Get signed URLs.
- **stripe.ts**: Initialize payment sheet, confirm payment, get publishable key.
- **account.ts**: Reset data, delete account via RPC.
- **supabase.ts**: Client initialization, environment variable validation, error helpers.

---

## Custom Hooks

- **useBookshelves**: Shelf CRUD operations, loading states, bookshelf count, reordering.
- **useBooks**: Book CRUD, reordering, stacking/unstacking, loading states.
- **useSpineImageUrl**: Resolve public URLs for spine images from the storage bucket with fallback handling.

---

## Key Components

### Core
- **BookSpine**: Renders a single book spine — either the image or a colored placeholder with title text.
- **BookshelfGrid**: Lays out books in variable-width rows to simulate a real shelf.
- **BookshelfPreview**: Summary card for the home screen showing shelf name, color, and a few preview spines.
- **BookDetailModal**: Full-screen modal for viewing/editing book details, review, and rating.
- **BookshelfEditModal**: Modal for editing shelf properties (name, color, style, privacy).

### Interactive
- **CameraScanner**: Full-screen camera capture with image upload and OCR flow.
- **SpineCropper**: Image cropping tool for adjusting captured spine images.
- **SpineFramer**: Visual framing tool for presentation of book spines.
- **DraggableBookSpine**: Draggable wrapper for reorder mode.
- **EditableBookshelfGrid**: Edit mode overlay with drag-and-drop support.
- **BrowseBooksModal**: Modal for browsing/searching community books and selecting them.
- **VerticalBookStack**: Display component for stacked (rotated) books.

### UI Primitives
- **Button**: Styled button with loading spinner state.
- **Input**: Text input with optional icon and error display.
- **Rating**: Interactive 5-star rating component.
- **EmptyState**: Centered message with icon for empty lists.
- **LoadingView**: Full-screen loading spinner with message.

---

## Constants & Utilities

- **Theme constants**: Complete color palettes, typography scale (xs–xxxl), spacing scale, border radius scale, shadow definitions, and book spine dimension constants.
- **Shelf colors**: Array of 10 predefined wood-tone hex color values.
- **Username generator**: Functions to create random bookish display names and unique public usernames with collision checking.
- **Placeholder spines**: Generate deterministic colored placeholder images for books without spine photos, using title-based hashing for color consistency.
- **Widget utilities**: Functions to push shelf snapshots to the iOS widget shared storage and batch-sync the full library.

---

## Environment Variables

```
EXPO_PUBLIC_SUPABASE_URL=<supabase-project-url>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=<stripe-publishable-key>
EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY=<google-vision-api-key>
```

---

## Development Scripts

```bash
npm start        # Start Expo dev server
npm run ios      # Run on iOS simulator
npm run android  # Run on Android emulator
npm run web      # Run in browser
npm run lint     # Run ESLint
npm run test     # Run Jest tests
npm run typecheck # Run TypeScript type checking
```
