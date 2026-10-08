CREATE INDEX IF NOT EXISTS ci_live_owner_time ON public.messages(user_id,created_at);
CREATE INDEX IF NOT EXISTS ci_live_conversation_time ON public.messages(user_id,conversation_id,created_at);
CREATE INDEX IF NOT EXISTS ci_history_linked_time ON public.instagram_history_events(user_id,linked_conversation_id,sent_at) WHERE linked_conversation_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.ci_reconcile_history(p_owner bigint) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE changed bigint;BEGIN
 WITH pairs AS MATERIALIZED(
 SELECT h.thread_key,m.conversation_id,h.source_key,m.id,h.display_text,h.sent_at
 FROM instagram_history_events h JOIN messages m ON m.user_id=h.user_id AND m.is_from_instagram AND m.content=h.display_text
 AND m.created_at BETWEEN h.sent_at-interval '2 seconds' AND h.sent_at+interval '2 seconds'
 WHERE h.user_id=p_owner AND h.direction='incoming' AND h.linked_conversation_id IS NULL AND length(h.display_text)>=10
 ), candidates AS(
 SELECT thread_key,conversation_id FROM pairs GROUP BY thread_key,conversation_id
 HAVING count(distinct source_key)>=3 AND count(distinct id)>=3 AND count(distinct display_text)>=3 AND max(sent_at)-min(sent_at)>=interval '1 minute'
 ), unique_pairs AS(
 SELECT c.* FROM candidates c WHERE(SELECT count(*) FROM candidates x WHERE x.thread_key=c.thread_key)=1 AND(SELECT count(*) FROM candidates x WHERE x.conversation_id=c.conversation_id)=1
 ) UPDATE instagram_history_events h SET linked_conversation_id=u.conversation_id FROM unique_pairs u WHERE h.user_id=p_owner AND h.thread_key=u.thread_key AND h.linked_conversation_id IS NULL;
 GET DIAGNOSTICS changed=ROW_COUNT;RETURN changed;END$$;
REVOKE ALL ON FUNCTION public.ci_reconcile_history(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ci_reconcile_history(bigint) TO service_role;
