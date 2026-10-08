-- Customer-only read path: no outbound template matching or second archive join.
CREATE OR REPLACE VIEW public.ci_evidence_messages WITH(security_invoker=true) AS
WITH incoming AS MATERIALIZED (
 SELECT h.user_id,'history:'||h.source_key AS event_key,coalesce('api:'||h.linked_conversation_id::text,'export:'||h.thread_key) AS customer_key,h.thread_key AS label,h.sent_at AS occurred_at,h.direction,h.display_text AS text,h.original_text,h.attachments,'customer'::text AS kind,'export'::text AS source,h.feedback_kind,h.feedback_signals AS derived_signals
 FROM ci_history_index h WHERE h.direction='incoming' AND NOT starts_with(h.display_text,'Instagram 게시물의 댓글에 비공개 답장을 보냈습니다') AND NOT starts_with(h.display_text,'You sent a private reply') AND NOT starts_with(h.display_text,'You unsent a message') AND NOT starts_with(h.display_text,'메시지를 보내지 않았습니다')
 AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.user_id=h.user_id AND m.id=h.meta_message_id)
 AND NOT(CASE WHEN h.linked_conversation_id IS NOT NULL AND length(h.display_text)>=10 THEN
 (SELECT count(*) FROM messages m WHERE m.user_id=h.user_id AND m.conversation_id=h.linked_conversation_id AND m.content=h.display_text
 AND m.is_from_instagram=(h.direction='incoming') AND m.created_at BETWEEN h.sent_at-interval '2 seconds' AND h.sent_at+interval '2 seconds')=1
 AND (SELECT count(*) FROM ci_history_index other WHERE other.user_id=h.user_id AND other.linked_conversation_id=h.linked_conversation_id
 AND other.display_text=h.display_text AND other.direction=h.direction AND other.sent_at BETWEEN h.sent_at-interval '4 seconds' AND h.sent_at+interval '4 seconds')=1
 ELSE false END)
 UNION ALL
 SELECT m.user_id,'api:'||m.id,'api:'||m.conversation_id::text,coalesce(c.recipient_username,c.recipient_id),m.created_at,'incoming',m.content,m.content,coalesce(m.attachments,'[]'::jsonb),'customer','api',ci_feedback_kind(m.content),ci_extract_signals(m.content)
 FROM messages m JOIN conversations c ON c.id=m.conversation_id AND c.user_id=m.user_id WHERE m.is_from_instagram AND m.content NOT LIKE 'ACT::%' AND m.content<>'[자동화 버튼 클릭]'
), duplicate_pairs AS MATERIALIZED (
 -- Unique long-text, cross-source matches only; never merge customer identities.
 SELECT a.event_key AS archive_key,b.event_key AS live_key,
 count(*) OVER(PARTITION BY a.event_key) AS archive_matches,
 count(*) OVER(PARTITION BY b.event_key) AS live_matches
 FROM incoming a JOIN incoming b ON b.user_id=a.user_id AND b.source='api'
 AND md5(b.text)=md5(a.text) AND b.text=a.text
 AND b.occurred_at BETWEEN a.occurred_at-interval '10 seconds' AND a.occurred_at+interval '10 seconds'
 WHERE a.source='export' AND length(a.text)>=80
), classified AS (
 SELECT incoming.*,CASE WHEN EXISTS(SELECT 1 FROM automations a WHERE a.user_id=incoming.user_id AND a.trigger_type='keyword' AND lower(trim(a.trigger_value))=lower(trim(incoming.text))) THEN 'trigger' WHEN feedback_kind='unclear' AND EXISTS(SELECT 1 FROM ci_keyword_only k WHERE k.user_id=incoming.user_id AND k.token=lower(trim(incoming.text))) THEN 'keyword_only' ELSE feedback_kind END AS quality_kind FROM incoming WHERE NOT EXISTS(SELECT 1 FROM duplicate_pairs d WHERE d.archive_key=incoming.event_key AND d.archive_matches=1 AND d.live_matches=1)
)
SELECT user_id,event_key,customer_key,label,occurred_at,direction,text,original_text,attachments,kind,source,feedback_kind,quality_kind,CASE WHEN quality_kind IN ('reaction','trigger','keyword_only') THEN '[]'::jsonb ELSE derived_signals END AS signals FROM classified;
REVOKE ALL ON public.ci_evidence_messages FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ci_evidence_messages TO service_role;
