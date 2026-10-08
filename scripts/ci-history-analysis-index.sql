-- Narrow derived index; original archive records remain untouched.
CREATE TABLE IF NOT EXISTS public.ci_history_index (
 user_id bigint NOT NULL,source_key text NOT NULL,thread_key text NOT NULL,sent_at timestamptz NOT NULL,direction text NOT NULL,display_text text NOT NULL,original_text text NOT NULL,attachments jsonb NOT NULL,meta_message_id text,linked_conversation_id uuid,
 PRIMARY KEY(user_id,source_key)
);
ALTER TABLE public.ci_history_index ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ci_history_index FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ci_history_index TO service_role;
CREATE INDEX IF NOT EXISTS ci_history_customer_time ON public.ci_history_index(user_id,(coalesce('api:'||linked_conversation_id::text,'export:'||thread_key)),sent_at);
CREATE INDEX IF NOT EXISTS ci_history_link_time ON public.ci_history_index(user_id,linked_conversation_id,sent_at) WHERE linked_conversation_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.ci_sync_history_index() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN DELETE FROM ci_history_index WHERE user_id=OLD.user_id AND source_key=OLD.source_key; RETURN OLD; END IF;
 INSERT INTO ci_history_index(user_id,source_key,thread_key,sent_at,direction,display_text,original_text,attachments,meta_message_id,linked_conversation_id)
 VALUES(NEW.user_id,NEW.source_key,NEW.thread_key,NEW.sent_at,NEW.direction,NEW.display_text,NEW.original_text,NEW.attachments,NEW.meta_message_id,NEW.linked_conversation_id)
 ON CONFLICT(user_id,source_key) DO UPDATE SET thread_key=EXCLUDED.thread_key,sent_at=EXCLUDED.sent_at,direction=EXCLUDED.direction,display_text=EXCLUDED.display_text,original_text=EXCLUDED.original_text,attachments=EXCLUDED.attachments,meta_message_id=EXCLUDED.meta_message_id,linked_conversation_id=EXCLUDED.linked_conversation_id;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION public.ci_sync_history_index() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ci_sync_history_index() TO service_role;
CREATE TRIGGER ci_history_index_sync AFTER INSERT OR UPDATE OR DELETE ON public.instagram_history_events FOR EACH ROW EXECUTE FUNCTION public.ci_sync_history_index();
CREATE OR REPLACE VIEW public.ci_messages WITH(security_invoker=true) AS
WITH templates AS (
 SELECT user_id,display_text FROM ci_history_index WHERE direction='outgoing' AND length(display_text)>10
 GROUP BY user_id,display_text HAVING count(distinct thread_key)>=10
), all_messages AS (
 SELECT h.user_id,'history:'||h.source_key AS event_key,coalesce('api:'||h.linked_conversation_id::text,'export:'||h.thread_key) AS customer_key,
 h.thread_key AS label,h.sent_at AS occurred_at,h.direction,h.display_text AS text,h.original_text,h.attachments,
 CASE WHEN h.display_text ~ '^(Instagram 게시물의 댓글에 비공개 답장을 보냈습니다|You sent a private reply|You unsent a message|메시지를 보내지 않았습니다)' THEN 'system'
 WHEN h.direction='outgoing' AND p.delivery_kind='automation' THEN 'automation'
 WHEN h.direction='outgoing' AND p.delivery_kind='manual' THEN 'manual'
 WHEN h.direction='outgoing' AND (t.display_text IS NOT NULL OR EXISTS(SELECT 1 FROM automations a WHERE a.user_id=h.user_id AND a.response_content->>'message'=h.display_text)) THEN 'automation_suspected'
 WHEN h.direction='outgoing' THEN 'outgoing_unknown'
 WHEN h.direction='incoming' THEN 'customer' ELSE 'unknown' END AS kind,
 'export'::text AS source
 FROM ci_history_index h LEFT JOIN message_provenance p ON p.user_id=h.user_id AND p.meta_message_id=h.meta_message_id
 LEFT JOIN templates t ON t.user_id=h.user_id AND t.display_text=h.display_text
 WHERE NOT EXISTS(SELECT 1 FROM messages m WHERE m.user_id=h.user_id AND m.id=h.meta_message_id)
 AND NOT(CASE WHEN h.linked_conversation_id IS NOT NULL AND length(h.display_text)>=10 THEN
 (SELECT count(*) FROM messages m WHERE m.user_id=h.user_id AND m.conversation_id=h.linked_conversation_id AND m.content=h.display_text
 AND m.is_from_instagram=(h.direction='incoming') AND m.created_at BETWEEN h.sent_at-interval '2 seconds' AND h.sent_at+interval '2 seconds')=1
 AND (SELECT count(*) FROM ci_history_index other WHERE other.user_id=h.user_id AND other.linked_conversation_id=h.linked_conversation_id
 AND other.display_text=h.display_text AND other.direction=h.direction AND other.sent_at BETWEEN h.sent_at-interval '4 seconds' AND h.sent_at+interval '4 seconds')=1
 ELSE false END)
 UNION ALL
 SELECT m.user_id,'api:'||m.id,'api:'||m.conversation_id::text,coalesce(c.recipient_username,c.recipient_id),m.created_at,
 CASE WHEN m.is_from_instagram THEN 'incoming' ELSE 'outgoing' END,m.content,m.content,coalesce(m.attachments,'[]'::jsonb),
 CASE WHEN m.content LIKE 'ACT::%' OR m.content='[자동화 버튼 클릭]' THEN 'system'
 WHEN m.is_from_instagram THEN 'customer' WHEN p.delivery_kind='automation' THEN 'automation' WHEN p.delivery_kind='manual' THEN 'manual' ELSE 'outgoing_unknown' END,
 'api'::text FROM messages m JOIN conversations c ON c.id=m.conversation_id AND c.user_id=m.user_id
 LEFT JOIN message_provenance p ON p.user_id=m.user_id AND p.meta_message_id=m.id
) SELECT * FROM all_messages;
REVOKE ALL ON public.ci_messages FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ci_messages TO service_role;
