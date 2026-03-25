-- Migration: Remove email column from public.users
-- Anonymous users never have an email, and email is stored in auth.users.
-- There is no need to duplicate it in the public profile table.

ALTER TABLE public.users DROP COLUMN IF EXISTS email;
