ALTER TABLE public.ci_backfill ADD COLUMN IF NOT EXISTS owner_id text GENERATED ALWAYS AS(user_id::text) STORED;
ALTER TABLE public.ci_backfill ADD COLUMN IF NOT EXISTS lease_until timestamptz;
CREATE OR REPLACE FUNCTION public.ci_claim_backfill(p_owner bigint DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE j ci_backfill;BEGIN
 SELECT * INTO j FROM ci_backfill WHERE status IN ('queued','running') AND(p_owner IS NULL OR user_id=p_owner) AND(lease_until IS NULL OR lease_until<now()) ORDER BY updated_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE ci_backfill SET lease_until=now()+interval '10 minutes' WHERE user_id=j.user_id;
 RETURN to_jsonb(j)-'user_id';END$$;
REVOKE ALL ON FUNCTION public.ci_claim_backfill(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ci_claim_backfill(bigint) TO service_role;
