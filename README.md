# Virtual Library App

A React Native + Expo iOS app for creating and managing virtual bookshelves. Users can organize their book collections, scan book spines, browse community uploads, and display their favorite shelf on their home screen with an iOS widget.

## Features

- **Bookshelf Management**: Create multiple bookshelves, customize colors, and organize books
- **Book Spines**: Visual representation of books on shelves with spine images
- **Book Scanning**: Use camera to scan book spines and add them to your collection
- **Community Library**: Browse and add book spines uploaded by other users
- **Reviews & Ratings**: Add personal reviews and ratings to your books
- **iOS Widget**: Display a bookshelf on your iPhone home screen
- **Premium Subscription**: Unlock unlimited bookshelves and the home screen widget via RevenueCat in-app purchases

## Tech Stack

- **Frontend**: React Native, Expo SDK 55, TypeScript
- **Navigation**: Expo Router (file-based routing)
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **Payments**: RevenueCat (native in-app purchases, paywall, and customer center)
- **State Management**: React Context + Custom Hooks

## Project Structure

```
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Main tab navigation
│   │   ├── index.tsx      # Home (My Library)
│   │   ├── community.tsx  # Community browsing
│   │   └── settings.tsx   # User settings
│   ├── bookshelf/         # Bookshelf detail (nested stack)
│   ├── book/[id].tsx      # Book detail
│   ├── user/[id].tsx      # Public user profile
│   ├── onboarding.tsx     # First-launch onboarding flow
│   ├── scan.tsx           # Camera scanner
│   ├── add-book.tsx       # Manual book entry
│   ├── create-bookshelf.tsx
│   ├── payment.tsx        # RevenueCat paywall / premium status
│   ├── customer-center.tsx # RevenueCat customer center
│   └── _layout.tsx        # Root layout
├── components/            # Reusable components
│   ├── ui/               # Basic UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Rating.tsx
│   │   └── ...
│   ├── BookSpine.tsx
│   ├── BookshelfGrid.tsx
│   ├── BookshelfPreview.tsx
│   ├── CameraScanner.tsx
│   └── CommunityBookItem.tsx
├── contexts/              # React Context providers
│   └── AuthContext.tsx
├── hooks/                 # Custom React hooks
│   ├── useBooks.ts
│   └── useBookshelves.ts
├── services/              # API services
│   ├── supabase.ts       # Supabase client
│   ├── auth.ts           # Authentication
│   ├── bookshelves.ts    # Bookshelf CRUD
│   ├── books.ts          # Book CRUD
│   ├── storage.ts        # File uploads
│   └── revenuecat.ts     # In-app purchases & entitlements
├── types/                 # TypeScript definitions
│   ├── index.ts
│   └── supabase.ts
├── utils/                 # Utility functions
│   └── widget.ts         # iOS widget helpers
├── constants/             # App constants
│   └── theme.ts          # Colors, typography, spacing
└── assets/               # Static assets
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator or physical iOS device
- Supabase account
- RevenueCat account (for in-app purchases)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/virtual-library-app.git
   cd virtual-library-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```

   Fill in your credentials:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_your-key
   ```

4. **Start the development server**
   ```bash
   npm start
   # or
   expo start
   ```

5. **Run on iOS**
   ```bash
   npm run ios
   # or press 'i' in the Expo CLI
   ```

## Supabase Setup

### 1. Create a new Supabase project

Go to [supabase.com](https://supabase.com) and create a new project.

### 2. Run the database migrations

Create the following tables in your Supabase SQL editor:

```sql
-- Users table (extends auth.users)
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  is_premium BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bookshelves table
CREATE TABLE public.bookshelves (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cover_color TEXT DEFAULT '#8B4513',
  is_public BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Books table
CREATE TABLE public.books (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  image_url TEXT,
  shelf_id UUID REFERENCES public.bookshelves(id) ON DELETE CASCADE NOT NULL,
  position INTEGER DEFAULT 0,
  review TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  uploaded_by_user_id UUID REFERENCES public.users(id) NOT NULL,
  is_community BOOLEAN DEFAULT true,
  is_stacked BOOLEAN DEFAULT false,
  isbn TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions table (for Stripe)
CREATE TABLE public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan_id TEXT NOT NULL,
  status TEXT DEFAULT 'inactive',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookshelves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can insert/read/update their own profile
CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Users can CRUD their own bookshelves
CREATE POLICY "Users can CRUD own bookshelves" ON public.bookshelves
  FOR ALL USING (auth.uid() = user_id);

-- Users can CRUD books on their shelves
CREATE POLICY "Users can CRUD own books" ON public.books
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.bookshelves
      WHERE bookshelves.id = books.shelf_id
      AND bookshelves.user_id = auth.uid()
    )
  );

-- Users can read community books
CREATE POLICY "Users can read community books" ON public.books
  FOR SELECT USING (is_community = true);

-- Users can read/update their subscription
CREATE POLICY "Users can read own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);
```

### 3. Create storage buckets

In Supabase Storage, create two buckets:

1. **book-spines** - Public bucket for book spine images
2. **avatars** - Public bucket for user avatars

Set the following policies for public access:

```sql
-- Allow public read access to book-spines
CREATE POLICY "Public read access" ON storage.objects
  FOR SELECT USING (bucket_id = 'book-spines');

-- Allow authenticated uploads to book-spines
CREATE POLICY "Authenticated upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'book-spines'
    AND auth.role() = 'authenticated'
  );
```

### 4. Enable Auth Providers

In Supabase Auth settings, enable:
- Email/Password authentication
- (Optional) OAuth providers like Google, Apple

## RevenueCat Setup

### 1. Create a RevenueCat project

Go to [revenuecat.com](https://www.revenuecat.com) and create a project with an iOS app.

### 2. Configure products and entitlement

In the RevenueCat dashboard:

1. Create `monthly` and `yearly` subscription products (linked to App Store Connect).
2. Create an entitlement named **`Virtual Library Pro`** (must match `ENTITLEMENT_ID` in `services/revenuecat.ts`).
3. Attach both products to the entitlement and add them to the default offering.
4. Configure a Paywall and the Customer Center for the default offering (the app renders both with `react-native-purchases-ui`).

### 3. Add the public SDK key

Copy the App Store public SDK key (`appl_...`) from Project Settings → API Keys into `.env`:

```env
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_...
```

Without this variable the app falls back to a RevenueCat **test-store key** that cannot process real purchases — fine for development, a blocker for release.

## iOS Widget Setup (expo-widgets)

This project uses the `expo-widgets` config plugin (SDK 55+) to generate the iOS widget target during prebuild. You should **not** manually create a Widget Extension target in Xcode.

### 1. Use a development build (not Expo Go)

`expo-widgets` is not available in Expo Go. Build and run a native development client instead:

```bash
npx expo prebuild -p ios --clean
npm run ios
```

### 2. Verify app config plugin

The widget is configured in `app.json` under:

- `plugins` includes `"expo-widgets"`
- `ios.widgets[0].name = "BookshelfWidget"`
- `ios.widgets[0].displayName = "My Bookshelf"`

### 3. Add and find the widget in simulator

1. Run the iOS build (`npm run ios`) and launch the app once.
2. Go to the iOS home screen in Simulator.
3. Long-press home screen → tap **+** (upper-left).
4. Search for **Virtual Library** (app name) or **My Bookshelf** (widget display name).

### 4. Troubleshooting if widget does not appear

- Make sure you are running a **development build** and not Expo Go.
- After changing widget config, rebuild native code:
  - `npx expo prebuild -p ios --clean`
  - `npm run ios`
- If you see `No such module 'ExpoWidgets'` in `ios/ExpoWidgetsTarget/index.swift`, your native iOS project is stale. Regenerate it and reinstall pods:
  - `rm -rf ios`
  - `npx expo prebuild -p ios --clean`
  - `cd ios && pod install && cd ..`
  - `npm run ios`
- Ensure the app has finished installing and opened at least once after build.
- If needed, reset simulator content and rerun the build.

### 5. Update widget snapshot from app data

```typescript
import { widgetManager } from '@/utils/widget';

await widgetManager.updateWidgetWithBookshelf(bookshelf, books);
```

## Scripts

```bash
# Start development server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Run TypeScript type checking
npm run typecheck

# Run linting
npm run lint

# Run tests
npm test
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` | RevenueCat public SDK key for iOS (`appl_...`) |
| `EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY` | Optional Google Books key for cover lookups |
| `EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY` | Optional Vision key for spine OCR auto-fill |

## API Services

### Authentication (`services/auth.ts`)
- `signUp(credentials)` - Register new user
- `signIn(credentials)` - Sign in existing user
- `signOut()` - Sign out current user
- `resetPassword(email)` - Send password reset email
- `updateProfile(updates)` - Update user profile

### Bookshelves (`services/bookshelves.ts`)
- `getUserBookshelves()` - Get all user's bookshelves
- `getBookshelfById(id)` - Get single bookshelf with books
- `createBookshelf(input)` - Create new bookshelf
- `updateBookshelf(id, updates)` - Update bookshelf
- `deleteBookshelf(id)` - Delete bookshelf and its books

### Books (`services/books.ts`)
- `getBooksByShelf(shelfId)` - Get books on a shelf
- `getBookById(id)` - Get single book
- `createBook(input)` - Add book to shelf
- `updateBook(id, updates)` - Update book details
- `deleteBook(id)` - Remove book from shelf
- `getCommunityBooks(page, pageSize)` - Browse community books

### Storage (`services/storage.ts`)
- `uploadBookSpine(uri, userId)` - Upload book spine image
- `uploadAvatar(uri, userId)` - Upload user avatar
- `deleteFile(bucket, path)` - Delete file from storage

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues and feature requests, please [open an issue](https://github.com/yourusername/virtual-library-app/issues).
