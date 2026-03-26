# Virtual Library — Comprehensive Project Prompt

## Overview

Build **Virtual Library**, a native iOS application in Swift for creating, managing, and sharing personal book collections. Users organize books into customizable virtual bookshelves, scan book spines with their camera, browse community-shared libraries, write reviews, and display their favorite shelf on their iOS home screen via a WidgetKit widget. The app uses anonymous authentication (no email required), Supabase as the backend, StoreKit 2 for premium subscriptions, and supports light/dark theming throughout.

---

## Tech Stack

- **Language**: Swift 5.9+
- **UI Framework**: SwiftUI
- **Minimum Deployment**: iOS 17.0
- **Navigation**: NavigationStack with NavigationPath for programmatic routing, TabView for top-level tabs
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Row-Level Security, Realtime) via the `supabase-swift` SDK
- **Payments**: StoreKit 2 (in-app subscriptions managed through App Store Connect)
- **OCR**: Apple Vision framework (`VNRecognizeTextRequest`) for on-device text recognition from book spine images
- **Widget**: WidgetKit (iOS home screen widget with Timeline providers)
- **Networking**: Swift concurrency (async/await) with Supabase Swift client
- **Local Storage**: SwiftData for local caching and offline persistence, UserDefaults for preferences
- **Image Handling**: PhotosUI (`PhotosPicker`) for photo library access, AVFoundation for camera capture
- **Testing**: XCTest, Swift Testing framework
- **Architecture**: MVVM (Model-View-ViewModel)
- **Platform target**: iOS only

---

## Authentication & User Management

- **Anonymous sign-in**: Users authenticate automatically without providing email or password. On first launch, create an anonymous Supabase auth session using `supabase-swift` and persist it across app restarts via Keychain storage.
- **Auto-generated profiles**: On account creation, generate a random bookish display name (e.g., "Curious Librarian") and a unique public username (e.g., "bookworm_4729"). Store these in a `users` table.
- **Profile customization**: Allow users to update their display name, public username (with uniqueness validation), and avatar (uploaded to a Supabase storage bucket).
- **Account management**: Provide options to reset all personal data and to fully delete the account (via a server-side RPC that cascades deletion across all related tables and storage).
- **Auth state observation**: Use Supabase's auth state change listener with Swift concurrency (`AsyncStream`) to keep the app's auth state in sync. Persist the session in Keychain so the user stays logged in across app restarts.

---

## Bookshelf Management

- **Create bookshelves**: Users can create named bookshelves with an optional description. Free-tier users are limited to 3 shelves; premium users get unlimited.
- **Shelf customization**:
  - **Color**: Choose from 10 predefined wood-tone color palettes (e.g., natural oak, dark walnut, cherry, etc.). Store as hex strings and convert to `Color` values.
  - **Style**: Two display modes — "bottom" (a shelf line beneath the books) or "full" (a rectangular background behind the books). Modeled as a Swift enum with `Codable` conformance.
- **Public/private toggle**: Each shelf can be toggled between public (visible to the community) and private.
- **Ordering**: Support drag-and-drop reordering of shelves on the home screen using SwiftUI's `.onMove` modifier or `DragGesture`. Persist position values in the database.
- **Editing**: Allow renaming, changing color/style, toggling visibility, and updating descriptions after creation.
- **Deletion**: Delete a shelf and cascade-remove all associated bookshelf items. Use `.swipeActions` or an edit mode for deletion UI.

---

## Book Management

- **Add books manually**: Provide a SwiftUI form with fields for title, author, ISBN (optional), and an optional spine image (from camera or photo library via `PhotosPicker`).
- **Scan book spines**: Open a full-screen camera view using `AVCaptureSession`. After capturing an image:
  1. Upload the image to Supabase storage (`book-spines` bucket).
  2. Run Apple Vision `VNRecognizeTextRequest` for on-device text extraction — no external API needed.
  3. Auto-populate title and author fields from the OCR results.
  4. Allow the user to crop/frame the spine image before saving using a custom `CropView` with gesture-based selection.
- **Import from images**: Allow selecting existing photos from the device library using `PhotosPicker` and processing them through the same OCR + crop flow.
- **Global book registry**: Books are stored in a shared `books` table. When a user adds a book, check for existing entries to avoid duplicates. Each book has: title, author, spine image URL, cover image URL (optional), ISBN (optional), the uploading user's ID, and a community flag.
- **Community submissions**: Users can mark their book spines as community-shared, making them available for other users to browse and add to their own shelves.
- **Per-user shelf data**: The `bookshelf_items` join table tracks each user's placement of a book on a shelf, including: position, review text, star rating, stacked state, and stack grouping.

---

## Book Display & Organization

- **Shelf rows**: Render books in visual rows that mimic a real bookshelf using SwiftUI `LazyVGrid` or a custom `Layout`. Book spines display as vertical `AsyncImage` views (or colored placeholders with the title if no image exists).
- **Responsive layout**: Use `GeometryReader` to dynamically calculate how many books fit per row based on screen width and spine image dimensions.
- **Book stacking**: Allow users to "stack" a book (rotate it flat/horizontal via `.rotationEffect`) for a realistic bookshelf look. Track stacked state and stack position.
- **Drag-and-drop reordering**: In edit mode, enable drag-and-drop to rearrange book positions within a shelf using `.draggable()` and `.dropDestination()` modifiers.
- **Quick add**: Show a "+" button on each shelf for fast access to the book addition flow.

---

## Reviews & Ratings

- **5-star rating**: Custom interactive star rating SwiftUI view on each book. Tap or drag to set rating (1–5 stars) using `DragGesture` for fluid interaction.
- **Written reviews**: `TextEditor` review field on the book detail screen. Reviews are per-user, per-book, per-shelf.
- **Edit and delete**: Allow modifying or clearing reviews and ratings at any time.
- **Persistence**: Store ratings and reviews in the `bookshelf_items` table.

---

## Community Features

- **Browse public shelves**: A dedicated "Explore" tab showing randomly sampled public bookshelves from other users.
- **User discovery**: Search for other users by display name or public username using `.searchable()` modifier.
- **View user profiles**: Tap a user to see all of their public bookshelves via `NavigationLink`.
- **Community book library**: Browse and search all community-shared book spines. Support paginated results using Supabase's `.range()` and full-text search.
- **Add community books**: Select any community book and add it directly to one of your own shelves.
- **Access control**: Free users get limited community access. Premium unlocks full browsing and search.

---

## Onboarding Flow

Implement a multi-step onboarding wizard that launches on first app open (after anonymous auth) using a `TabView` with `.tabViewStyle(.page)` or a custom step-based navigation. Steps:

1. **Welcome**: Introduction screen explaining the app's purpose with animated illustrations.
2. **Style selection**: Choose shelf style ("bottom" or "full") and pick a shelf color from the palette. Show a live preview that updates in real-time using `@State` bindings.
3. **Populate**: Add initial books — either manually, by scanning, or by browsing community books.
4. **Layout preview**: Show a preview of the shelf with the selected books, style, and color.
5. **Name**: Enter a name for the first bookshelf.
6. **Reveal**: Animated reveal of the completed bookshelf with a celebratory transition using SwiftUI `.matchedGeometryEffect` or custom `Animation`.

- Support skipping individual steps.
- Persist onboarding completion state in `UserDefaults` (via `@AppStorage`) so it only shows once.
- Manage all onboarding state through a dedicated `@Observable` class (`OnboardingViewModel`).

---

## Premium Subscription (StoreKit 2)

- **Two plans** (configured in App Store Connect):
  - Monthly: $4.99/month
  - Yearly: $39.99/year (~33% savings)
- **Premium features**:
  - Unlimited bookshelves (free tier limited to 3)
  - iOS home screen widget
  - Priority book scanning
  - No ads
  - Full community access
- **Payment flow**: Use StoreKit 2's `Product.purchase()` API. Display products using `StoreView` or a custom paywall. Verify transactions with `Transaction.currentEntitlements` and `Transaction.updates`.
- **Subscription tracking**: On successful purchase, update the user's `is_premium` flag in Supabase and store subscription details in the `subscriptions` table. Use App Store Server Notifications (via a Supabase Edge Function or server endpoint) for renewal/cancellation events.
- **Real-time sync**: Listen to `Transaction.updates` on app launch and in the background to keep premium status current. Sync with Supabase on every status change.

---

## iOS Home Screen Widget (WidgetKit)

- **Widget display**: Show a single bookshelf (user's choice) on the iOS home screen, rendering the shelf background color and book spine images.
- **Multiple sizes**: Support `.systemSmall`, `.systemMedium`, and `.systemLarge` widget families with appropriate layouts for each.
- **Data sync**: Use an App Group shared container to pass shelf snapshot data between the main app and the widget extension. Write snapshots as JSON to the shared `UserDefaults` suite. Call `WidgetCenter.shared.reloadAllTimelines()` whenever shelf data changes.
- **Timeline provider**: Implement `TimelineProvider` with a `getTimeline` method that reads from the shared container and provides `TimelineEntry` objects.
- **Tap to open**: Use `widgetURL()` or `Link` with a deep link URL scheme to open the app directly to the selected shelf.
- **Image caching**: Cache spine images to the App Group's shared file directory so the widget can render them without network access.

---

## Theming

- **Three modes**: Light, Dark, and Standard (follows system setting). Use SwiftUI's `@Environment(\.colorScheme)` for system detection.
- **Persistent preference**: Save the selected theme to `@AppStorage` and apply it using `.preferredColorScheme()` modifier on the root view.
- **Complete color system**: Define a full palette for each theme as a Swift struct/enum covering: primary, secondary, accent, background, surface, text (primary/secondary/tertiary), border, status colors (success, warning, error, info), and component-specific overrides. Use `Color` extensions or an asset catalog with dark/light variants.
- **Theme environment**: Inject the active theme into the SwiftUI environment via a custom `EnvironmentKey` so all views can access theme colors.

---

## Data Import

- **Goodreads CSV import**: On the settings screen, allow users to import a Goodreads export CSV file using `.fileImporter()` modifier. Parse it with a custom CSV parser to extract book titles and authors, then bulk-create books and add them to a selected shelf.
- **Validation**: Validate CSV format and handle parsing errors gracefully with user-facing alerts.
- **Flexible mapping**: Support variations in Goodreads CSV column naming.

---

## Navigation Structure

### Tab Navigation (TabView)
| Tab | View | Purpose |
|-----|------|---------|
| Home | `LibraryView` | Display the user's library — all shelves with book previews |
| Explore | `CommunityView` | Browse public shelves, search users, discover books |
| Settings | `SettingsView` | Account management, theme, import/export, premium |

### Detail Screens (NavigationStack push)
| View | Purpose |
|------|---------|
| `BookshelfDetailView` | View and edit a single shelf with full book grid |
| `BookDetailView` | View and edit a single book — details, review, rating |
| `UserProfileView` | View another user's public bookshelves |

### Modal/Sheet Presentations
| View | Presentation | Purpose |
|------|-------------|---------|
| `OnboardingView` | `.fullScreenCover` | Multi-step first-run wizard |
| `CameraScannerView` | `.fullScreenCover` | Full-screen camera for spine scanning |
| `AddBookView` | `.sheet` | Manual book entry form |
| `CreateBookshelfView` | `.sheet` | New bookshelf creation form |
| `PaywallView` | `.sheet` | StoreKit payment UI for premium upgrade |
| `BookshelfEditView` | `.sheet` | Edit shelf properties |

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

## Architecture (MVVM)

### Models
Define Swift structs with `Codable` and `Identifiable` conformance for each database entity:

- **User**: Maps to the `users` table. Includes computed properties for display formatting.
- **Bookshelf**: Maps to the `bookshelves` table. Includes a `ShelfStyle` enum and `Color` conversion from hex.
- **Book**: Maps to the `books` table. Includes optional fields and storage URL helpers.
- **BookshelfItem**: Maps to the `bookshelf_items` table. Includes review/rating and stack state.
- **Subscription**: Maps to the `subscriptions` table. Includes status enum and expiration logic.

### ViewModels (`@Observable` classes)
- **AuthViewModel**: Manages anonymous auth session, user profile state, sign in/out, profile updates, auth error handling, and session persistence.
- **LibraryViewModel**: Shelf CRUD operations, loading states, bookshelf count, reordering, fetching all user shelves.
- **BookshelfDetailViewModel**: Book CRUD for a specific shelf, reordering, stacking/unstacking, loading states.
- **CommunityViewModel**: Fetch public shelves, search users, browse/search community books with pagination.
- **OnboardingViewModel**: Multi-step state management, shelf preview data, completion persistence.
- **SubscriptionViewModel**: StoreKit 2 product fetching, purchase flow, entitlement checking, sync with Supabase.
- **SettingsViewModel**: Theme management, Goodreads import, account actions.

### Services (async/await)
Organize all Supabase/API calls into dedicated service classes or actors:

- **AuthService**: Sign in, sign out, get session, get/update profile, check username availability, auth state stream.
- **BookshelfService**: CRUD for shelves, reorder, fetch public shelves, search users, get public user shelves.
- **BookService**: CRUD for books, community book search/browse, reorder, stack/unstack operations.
- **StorageService**: Upload/delete spine images, cover images, and avatars. Get public URLs.
- **StoreKitService**: Fetch products, purchase, listen for transaction updates, verify entitlements.
- **AccountService**: Reset data, delete account via RPC.
- **SupabaseClient**: Singleton client initialization, configuration.

---

## Key Views

### Core Views
- **BookSpineView**: Renders a single book spine — either an `AsyncImage` or a colored `RoundedRectangle` placeholder with rotated title text.
- **BookshelfGridView**: Lays out books in variable-width rows using a custom `Layout` or `LazyVGrid` to simulate a real shelf.
- **BookshelfPreviewCard**: Summary card for the home screen showing shelf name, color, and a few preview spines.
- **BookDetailView**: Full view for viewing/editing book details, review, and star rating.
- **BookshelfEditView**: Sheet for editing shelf properties (name, color picker, style toggle, privacy switch).

### Interactive Views
- **CameraScannerView**: Full-screen `AVCaptureSession`-backed camera view with capture button and image processing pipeline.
- **SpineCropperView**: Image cropping overlay with draggable handles for adjusting captured spine images.
- **SpineFramerView**: Visual framing tool for presentation of book spines.
- **DraggableBookSpine**: Book spine wrapper with `.draggable()` support for reorder mode.
- **BrowseBooksSheet**: Sheet for browsing/searching community books with `LazyVStack` and pagination.
- **VerticalBookStackView**: Display component for stacked (rotated) books.

### Reusable Components
- **StarRatingView**: Interactive 5-star rating with tap and drag gesture support.
- **LoadingOverlay**: Full-screen `ProgressView` with message.
- **EmptyStateView**: Centered `ContentUnavailableView` for empty lists.
- **ShelfColorPicker**: Horizontal scrolling color swatch selector.

---

## Constants & Utilities

- **Theme**: Complete `Color` palettes for light/dark, typography scale using `Font` modifiers, spacing constants, corner radius values, shadow definitions, and book spine dimension constants.
- **ShelfColors**: Static array of 10 predefined wood-tone hex color values with `Color` conversion extensions.
- **UsernameGenerator**: Functions to create random bookish display names and unique public usernames with collision checking against Supabase.
- **PlaceholderSpine**: Generate deterministic colored placeholders for books without spine photos, using a hash of the title for consistent color assignment.
- **WidgetDataManager**: Functions to write shelf snapshots as JSON to the App Group shared container and trigger `WidgetCenter` timeline reloads.
- **Color+Hex**: Extension on `Color` for initializing from hex strings and converting back.

---

## Configuration

### Xcode Project Setup
- Create an Xcode project with a SwiftUI App lifecycle (`@main App` struct).
- Add a Widget Extension target for the WidgetKit home screen widget.
- Configure an App Group (e.g., `group.com.yourcompany.virtuallibrary`) shared between the main app and widget extension.
- Add `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` to `Info.plist`.
- Configure StoreKit subscription product IDs in App Store Connect and add a StoreKit configuration file for testing.

### Dependencies (Swift Package Manager)
```
supabase-swift       — Supabase client (auth, database, storage, realtime)
```

### Environment Variables / Configuration
Store sensitive values in a `Config.plist` or Xcode build configuration (not in source control):
```
SUPABASE_URL=<supabase-project-url>
SUPABASE_ANON_KEY=<supabase-anon-key>
```
