-- Adds a security-definer RPC that lets an authenticated user fully delete
-- their own account and all first-party relational data.

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.books
  WHERE uploaded_by_user_id = current_user_id;

  DELETE FROM public.bookshelves
  WHERE user_id = current_user_id;

  DELETE FROM public.users
  WHERE id = current_user_id;

  DELETE FROM auth.users
  WHERE id = current_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
