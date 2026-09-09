-- EMPTY DATABASES ONLY. Legacy baseline required by the historical migrations.
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
  stack_id UUID,
  stack_position INTEGER DEFAULT 0,
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
