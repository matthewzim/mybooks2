-- Fix: Ensure handle_new_user trigger handles anonymous users (NULL email) gracefully.
-- Anonymous sign-in fails with "Database error creating anonymous user" when the
-- trigger function tries to insert a row with a NOT NULL email constraint, or when
-- the trigger function doesn't exist and needs to be created.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,  -- NULL for anonymous users; column is nullable
    NULL
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
