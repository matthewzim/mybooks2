-- Fix: Ensure handle_new_user trigger handles anonymous users (NULL email) gracefully.
-- Anonymous sign-in fails with "Database error creating anonymous user" when the
-- trigger function tries to insert a row that violates a constraint, or when
-- the trigger function doesn't exist and needs to be created.
--
-- This migration runs AFTER 20260325_auto_generate_usernames.sql (alphabetically)
-- and is the definitive version of handle_new_user(). It generates bookish names
-- for new users and wraps the insert in an exception handler so the trigger
-- never prevents auth.users creation.

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
EXCEPTION
  WHEN OTHERS THEN
    -- Never let a profile-creation failure block auth.users creation.
    -- The application layer (services/auth.ts) will upsert the profile
    -- as a fallback after sign-in succeeds.
    RAISE WARNING 'handle_new_user trigger failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate the trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
