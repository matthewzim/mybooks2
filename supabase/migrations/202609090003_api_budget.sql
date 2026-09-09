BEGIN;
CREATE TABLE public.api_request_budgets (key text PRIMARY KEY, window_start timestamptz NOT NULL, requests integer NOT NULL);
ALTER TABLE public.api_request_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_request_budgets FROM anon, authenticated;
-- Atomic shared counters, not per-device throttling. Scheduled maintenance may
-- delete rows with window_start < now() - interval '1 day'.
CREATE FUNCTION public.consume_api_budget(p_key text, p_limit integer, p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
 INSERT INTO public.api_request_budgets AS b VALUES (p_key,now(),1)
 ON CONFLICT (key) DO UPDATE SET
   requests = CASE WHEN b.window_start <= now() - make_interval(secs => p_window_seconds) THEN 1 ELSE b.requests + 1 END,
   window_start = CASE WHEN b.window_start <= now() - make_interval(secs => p_window_seconds) THEN now() ELSE b.window_start END
 RETURNING requests INTO n;
 RETURN n <= p_limit;
END $$;
REVOKE ALL ON FUNCTION public.consume_api_budget(text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_budget(text,integer,integer) TO service_role;
COMMIT;
