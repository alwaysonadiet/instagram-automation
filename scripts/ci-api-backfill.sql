CREATE TABLE IF NOT EXISTS public.ci_backfill (
 user_id bigint PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 owner_id text GENERATED ALWAYS AS(user_id::text) STORED,lease_until timestamptz,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','complete','error')),
 conversation_after text,conversations jsonb NOT NULL DEFAULT '[]',active jsonb,message_after text,
 conversations_done integer NOT NULL DEFAULT 0,messages_inserted integer NOT NULL DEFAULT 0,last_error text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ci_backfill ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ci_backfill FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ci_backfill TO service_role;
CREATE OR REPLACE FUNCTION public.ci_source_account(p_owner bigint) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('id',id::text,'business_account_id',business_account_id::text,'username',username,'access_token',access_token) FROM users WHERE id=p_owner;
$$;
REVOKE ALL ON FUNCTION public.ci_source_account(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ci_source_account(bigint) TO service_role;

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS ingest_source text NOT NULL DEFAULT 'webhook' CHECK(ingest_source IN ('webhook','backfill','manual'));
