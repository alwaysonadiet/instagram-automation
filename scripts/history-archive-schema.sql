CREATE OR REPLACE FUNCTION public.history_overview(p_owner bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT jsonb_build_object('messages',count(*),'conversations',count(distinct thread_key),'unknown',count(*) filter(where direction='unknown'),'earliest',min(sent_at),'latest',max(sent_at)) FROM instagram_history_events WHERE user_id=p_owner;
$$;
CREATE OR REPLACE FUNCTION public.history_threads(p_owner bigint,p_skip integer DEFAULT 0,p_take integer DEFAULT 30)
RETURNS TABLE(thread_key text,participants jsonb,message_count bigint,first_at timestamptz,last_at timestamptz,unknown_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT e.thread_key,(array_agg(e.participants order by e.sent_at desc))[1],count(*),min(e.sent_at),max(e.sent_at),count(*) filter(where e.direction='unknown') FROM instagram_history_events e WHERE e.user_id=p_owner GROUP BY e.thread_key ORDER BY max(e.sent_at) DESC,e.thread_key LIMIT least(greatest(p_take,1),50) OFFSET greatest(p_skip,0);
$$;
REVOKE ALL ON FUNCTION public.history_overview(bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.history_threads(bigint,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.history_overview(bigint),public.history_threads(bigint,integer,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.history_display_name(p_value text) RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN RETURN normalize(convert_from(convert_to(p_value,'LATIN1'),'UTF8'),NFC); EXCEPTION WHEN OTHERS THEN RETURN normalize(p_value,NFC); END;
$$;
CREATE OR REPLACE FUNCTION public.history_set_directions(p_owner bigint,p_names text[]) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE changed bigint;
BEGIN
 UPDATE instagram_history_events e SET direction=CASE
 WHEN trim(history_display_name(e.sender_name))=ANY(p_names) THEN 'outgoing'
 WHEN EXISTS(SELECT 1 FROM jsonb_array_elements_text(e.participants) p WHERE trim(history_display_name(p.value))=ANY(p_names)) THEN 'incoming'
 ELSE 'unknown' END WHERE e.user_id=p_owner;
 GET DIAGNOSTICS changed=ROW_COUNT;RETURN changed;
END;
$$;
REVOKE ALL ON FUNCTION public.history_display_name(text),public.history_set_directions(bigint,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.history_display_name(text),public.history_set_directions(bigint,text[]) TO service_role;
CREATE TABLE IF NOT EXISTS public.message_provenance (
 user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 meta_message_id text NOT NULL,
 delivery_kind text NOT NULL CHECK(delivery_kind IN ('automation','manual')),
 recipient_id text,comment_id text,recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,meta_message_id)
);
ALTER TABLE public.message_provenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_provenance FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.message_provenance TO service_role;
