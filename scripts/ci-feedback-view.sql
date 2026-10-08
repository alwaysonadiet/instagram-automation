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
 'export'::text AS source,h.feedback_kind AS feedback_kind
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
 'api'::text,ci_feedback_kind(m.content) FROM messages m JOIN conversations c ON c.id=m.conversation_id AND c.user_id=m.user_id
 LEFT JOIN message_provenance p ON p.user_id=m.user_id AND p.meta_message_id=m.id
) SELECT all_messages.*,CASE WHEN kind='customer' AND EXISTS(SELECT 1 FROM automations a WHERE a.user_id=all_messages.user_id AND a.trigger_type='keyword' AND lower(trim(a.trigger_value))=lower(trim(all_messages.text))) THEN 'trigger' WHEN kind='customer' AND feedback_kind='unclear' AND EXISTS(SELECT 1 FROM ci_keyword_only k WHERE k.user_id=all_messages.user_id AND k.token=lower(trim(all_messages.text))) THEN 'keyword_only' ELSE feedback_kind END AS quality_kind FROM all_messages;
REVOKE ALL ON public.ci_messages FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ci_messages TO service_role;
