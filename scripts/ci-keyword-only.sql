-- Repeated short keyword-only requests are engagement, not a customer problem.
-- Only low-information messages qualify; concrete questions are never suppressed.
CREATE TABLE public.ci_keyword_only (
 user_id bigint NOT NULL,token text NOT NULL,conversations integer NOT NULL,PRIMARY KEY(user_id,token)
);
ALTER TABLE public.ci_keyword_only ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ci_keyword_only FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ci_keyword_only TO service_role;
CREATE OR REPLACE FUNCTION public.ci_refresh_keyword_only() RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public SET jit=off AS $$
 INSERT INTO ci_keyword_only(user_id,token,conversations)
 SELECT user_id,lower(trim(display_text)),count(distinct thread_key) FROM ci_history_index
 WHERE direction='incoming' AND feedback_kind='unclear' AND length(trim(display_text)) BETWEEN 1 AND 30
 AND display_text !~ '[?？.!！]' GROUP BY user_id,lower(trim(display_text)) HAVING count(distinct thread_key)>=10
 ON CONFLICT(user_id,token) DO UPDATE SET conversations=EXCLUDED.conversations;
$$;
REVOKE ALL ON FUNCTION public.ci_refresh_keyword_only() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ci_refresh_keyword_only() TO service_role;
