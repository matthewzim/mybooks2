-- Auto-generate bookish profile names and public usernames for new anonymous users.
--
-- The application layer (services/auth.ts) handles this for normal sign-ups,
-- but this trigger ensures the database also generates names as a fallback
-- when users are created directly via Supabase Auth.

-- Helper: generate a random bookish username (adjective + noun + number)
CREATE OR REPLACE FUNCTION public.generate_bookish_username()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  adjectives TEXT[] := ARRAY[
    'midnight','cozy','silent','clever','curious','dreamy','gentle','hidden',
    'hushed','keen','leafy','misty','noble','quiet','rustic','secret',
    'steady','tender','velvet','wandering','whispering','wistful','amber',
    'bright','crimson','dusk','faded','golden','ivory','lunar','mossy',
    'olive','pale','rosy','silver','twilight','vintage','willow','starlit',
    'frosted','ember'
  ];
  nouns TEXT[] := ARRAY[
    'bookworm','librarian','scribe','reader','scholar','novelist',
    'bibliophile','storyteller','narrator','chronicler','poet','penman',
    'wordsmith','bookseller','quill','bookmark','chapter','manuscript',
    'inkwell','parchment','tome','almanac','fable','lexicon','sonnet',
    'verse','scroll','folio','gazette','opus'
  ];
  candidate TEXT;
  retries INT := 0;
BEGIN
  LOOP
    candidate := adjectives[1 + floor(random() * array_length(adjectives, 1))::int]
              || nouns[1 + floor(random() * array_length(nouns, 1))::int]
              || floor(random() * 100)::text;

    -- Check uniqueness
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE public_username = candidate) THEN
      RETURN candidate;
    END IF;

    retries := retries + 1;
    IF retries > 10 THEN
      -- Extremely unlikely; append extra digits to guarantee uniqueness
      RETURN candidate || floor(random() * 9000 + 1000)::text;
    END IF;
  END LOOP;
END;
$$;

-- Helper: generate a display-friendly bookish name (PascalCase)
CREATE OR REPLACE FUNCTION public.generate_bookish_display_name()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  adjectives TEXT[] := ARRAY[
    'Midnight','Cozy','Silent','Clever','Curious','Dreamy','Gentle','Hidden',
    'Hushed','Keen','Leafy','Misty','Noble','Quiet','Rustic','Secret',
    'Steady','Tender','Velvet','Wandering','Whispering','Wistful','Amber',
    'Bright','Crimson','Dusk','Faded','Golden','Ivory','Lunar','Mossy',
    'Olive','Pale','Rosy','Silver','Twilight','Vintage','Willow','Starlit',
    'Frosted','Ember'
  ];
  nouns TEXT[] := ARRAY[
    'Bookworm','Librarian','Scribe','Reader','Scholar','Novelist',
    'Bibliophile','Storyteller','Narrator','Chronicler','Poet','Penman',
    'Wordsmith','Bookseller','Quill','Bookmark','Chapter','Manuscript',
    'Inkwell','Parchment','Tome','Almanac','Fable','Lexicon','Sonnet',
    'Verse','Scroll','Folio','Gazette','Opus'
  ];
BEGIN
  RETURN adjectives[1 + floor(random() * array_length(adjectives, 1))::int]
      || nouns[1 + floor(random() * array_length(nouns, 1))::int]
      || floor(random() * 100)::text;
END;
$$;

-- Update the trigger to auto-assign names for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, name, public_username)
  VALUES (
    NEW.id,
    public.generate_bookish_display_name(),
    public.generate_bookish_username()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Recreate the trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
