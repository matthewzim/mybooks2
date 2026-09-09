BEGIN;
ALTER TABLE public.users ADD COLUMN premium_expires_at timestamptz;
ALTER TABLE public.users ADD COLUMN premium_checked_at timestamptz;
CREATE OR REPLACE FUNCTION public.apply_premium_status(p_user_id uuid, p_active boolean, p_expires_at timestamptz, p_fetched_at timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.users SET is_premium = p_active AND (p_expires_at IS NULL OR p_expires_at > now()),
    premium_expires_at = p_expires_at, premium_checked_at = p_fetched_at, updated_at = now()
  WHERE id = p_user_id AND (premium_checked_at IS NULL OR premium_checked_at < p_fetched_at);
$$;
REVOKE ALL ON FUNCTION public.apply_premium_status(uuid,boolean,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_premium_status(uuid,boolean,timestamptz,timestamptz) TO service_role;
COMMIT;
