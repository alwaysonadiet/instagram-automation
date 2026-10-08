-- Additive, service-only derived data. Original messages are never rewritten by AI.
CREATE TABLE IF NOT EXISTS public.ci_settings (
 user_id bigint PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 owner_names text[] NOT NULL DEFAULT '{}', analysis_enabled boolean NOT NULL DEFAULT true,
 purchase_secret text NOT NULL DEFAULT(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')),
 daily_limit integer NOT NULL DEFAULT 5 CHECK(daily_limit BETWEEN 0 AND 20)
);
CREATE TABLE IF NOT EXISTS public.ci_products (
 user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 product_key text NOT NULL, label text NOT NULL, keywords text[] NOT NULL DEFAULT '{}',
 PRIMARY KEY(user_id,product_key)
);
CREATE TABLE IF NOT EXISTS public.ci_jobs (
 user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 customer_key text NOT NULL, period text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','ready','error')),
 input_hash text, insight jsonb, model text, schema_version integer NOT NULL DEFAULT 1,
 revision integer NOT NULL DEFAULT 0,lease_until timestamptz, attempts integer NOT NULL DEFAULT 0, last_error text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,customer_key,period)
);
CREATE TABLE IF NOT EXISTS public.ci_usage (
 user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 day date NOT NULL, calls integer NOT NULL DEFAULT 0, PRIMARY KEY(user_id,day)
);
CREATE TABLE IF NOT EXISTS public.ci_content (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 format text NOT NULL CHECK(format IN ('Reel','Carousel','Story','FAQ','Sales Page','Content Idea')),
 title text NOT NULL, outline text NOT NULL,evidence_keys text[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ci_links (
 slug text PRIMARY KEY,user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,owner_id text GENERATED ALWAYS AS(user_id::text) STORED,
 content_id uuid REFERENCES public.ci_content(id),destination text NOT NULL,customer_key text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ci_clicks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 slug text NOT NULL REFERENCES public.ci_links(slug),clicked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ci_purchases (
 user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,order_key text NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),amount numeric(18,2) NOT NULL CHECK(amount>=0),
 status text NOT NULL DEFAULT 'paid' CHECK(status IN ('paid','refunded','cancelled','failed')),refunded_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK(refunded_amount>=0),
 paid_at timestamptz NOT NULL,customer_key text,click_id uuid REFERENCES public.ci_clicks(id),
 source text NOT NULL CHECK(source IN ('verified_webhook','manual_confirmed')),
 PRIMARY KEY(user_id,order_key)
);
CREATE INDEX IF NOT EXISTS ci_jobs_pending ON public.ci_jobs(status,updated_at);
CREATE INDEX IF NOT EXISTS ci_purchases_customer ON public.ci_purchases(user_id,customer_key,paid_at);
CREATE INDEX IF NOT EXISTS ci_content_owner ON public.ci_content(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ci_links_owner ON public.ci_links(user_id);
CREATE INDEX IF NOT EXISTS ci_clicks_link ON public.ci_clicks(slug,clicked_at);
ALTER TABLE public.ci_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ci_settings FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ci_settings TO service_role;
ALTER TABLE public.ci_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ci_products FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ci_products TO service_role;
ALTER TABLE public.ci_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ci_jobs FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ci_jobs TO service_role;
ALTER TABLE public.ci_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ci_usage FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ci_usage TO service_role;
ALTER TABLE public.ci_content ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ci_content FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ci_content TO service_role;
ALTER TABLE public.ci_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ci_links FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ci_links TO service_role;
ALTER TABLE public.ci_clicks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ci_clicks FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ci_clicks TO service_role;
ALTER TABLE public.ci_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ci_purchases FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ci_purchases TO service_role;
CREATE OR REPLACE VIEW public.ci_messages WITH(security_invoker=true) AS
WITH templates AS (
 SELECT user_id,display_text FROM instagram_history_events WHERE direction='outgoing' AND length(display_text)>10
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
 FROM instagram_history_events h LEFT JOIN message_provenance p ON p.user_id=h.user_id AND p.meta_message_id=h.meta_message_id
 LEFT JOIN templates t ON t.user_id=h.user_id AND t.display_text=h.display_text
 WHERE NOT EXISTS(SELECT 1 FROM messages m WHERE m.user_id=h.user_id AND m.id=h.meta_message_id)
 AND NOT(CASE WHEN h.linked_conversation_id IS NOT NULL AND length(h.display_text)>=10 THEN
 (SELECT count(*) FROM messages m WHERE m.user_id=h.user_id AND m.conversation_id=h.linked_conversation_id AND m.content=h.display_text
 AND m.is_from_instagram=(h.direction='incoming') AND m.created_at BETWEEN h.sent_at-interval '2 seconds' AND h.sent_at+interval '2 seconds')=1
 AND (SELECT count(*) FROM instagram_history_events other WHERE other.user_id=h.user_id AND other.linked_conversation_id=h.linked_conversation_id
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
CREATE OR REPLACE FUNCTION public.ci_queue_message() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE k text;ts timestamptz;txt text;
BEGIN
 IF TG_TABLE_NAME='messages' THEN
  IF NOT NEW.is_from_instagram THEN RETURN NEW;END IF;k='api:'||NEW.conversation_id::text;ts=NEW.created_at;txt=NEW.content;
 ELSE
  IF NEW.direction<>'incoming' THEN RETURN NEW;END IF;k=coalesce('api:'||NEW.linked_conversation_id::text,'export:'||NEW.thread_key);ts=NEW.sent_at;txt=NEW.display_text;
 END IF;
 IF length(txt)<25 OR txt LIKE 'ACT::%' THEN RETURN NEW;END IF;
 INSERT INTO ci_jobs(user_id,customer_key,period) VALUES(NEW.user_id,k,to_char(ts AT TIME ZONE 'UTC','YYYY-MM'))
 ON CONFLICT(user_id,customer_key,period) DO UPDATE SET status=CASE WHEN ci_jobs.status='processing' THEN 'processing' ELSE 'pending' END,revision=ci_jobs.revision+1,attempts=CASE WHEN ci_jobs.status='processing' THEN ci_jobs.attempts ELSE 0 END,updated_at=now();
 RETURN NEW;
END$$;
CREATE TRIGGER ci_new_live_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.ci_queue_message();
CREATE TRIGGER ci_new_history_message AFTER INSERT ON public.instagram_history_events FOR EACH ROW EXECUTE FUNCTION public.ci_queue_message();
CREATE OR REPLACE FUNCTION public.ci_seed_jobs(p_owner bigint) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE n bigint;BEGIN
 INSERT INTO ci_jobs(user_id,customer_key,period)
 SELECT p_owner,customer_key,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM') FROM ci_messages
 WHERE user_id=p_owner AND kind='customer' AND length(text)>=25 GROUP BY customer_key,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM')
 ON CONFLICT DO NOTHING;GET DIAGNOSTICS n=ROW_COUNT;RETURN n;END$$;
CREATE OR REPLACE FUNCTION public.ci_claim_job() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE j ci_jobs;s ci_settings;payload jsonb;h text;spent integer;
BEGIN
 SELECT q.* INTO j FROM ci_jobs q JOIN ci_settings settings ON settings.user_id=q.user_id
 WHERE settings.analysis_enabled AND settings.daily_limit>0 AND q.attempts<3
 AND (q.status IN ('pending','error') OR(q.status='processing' AND q.lease_until<now()))
 AND coalesce((SELECT calls FROM ci_usage u WHERE u.user_id=q.user_id AND u.day=(now() AT TIME ZONE 'UTC')::date),0)<settings.daily_limit
 ORDER BY q.period DESC,q.updated_at DESC LIMIT 1 FOR UPDATE OF q SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO s FROM ci_settings WHERE user_id=j.user_id FOR UPDATE;
 INSERT INTO ci_usage(user_id,day,calls) VALUES(j.user_id,(now() AT TIME ZONE 'UTC')::date,0) ON CONFLICT DO NOTHING;
 SELECT calls INTO spent FROM ci_usage WHERE user_id=j.user_id AND day=(now() AT TIME ZONE 'UTC')::date FOR UPDATE;
 IF spent>=s.daily_limit THEN RETURN NULL;END IF;
 SELECT jsonb_agg(row_to_json(e) ORDER BY occurred_at,event_key) INTO payload FROM (
 SELECT event_key,occurred_at,left(text,700) AS text FROM ci_messages WHERE user_id=j.user_id AND customer_key=j.customer_key
 AND kind='customer' AND length(text)>=25 AND to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM')=j.period ORDER BY occurred_at DESC,event_key DESC LIMIT 8
 ) e;
 h=md5(coalesce(payload::text,'[]'));
 IF payload IS NULL OR(j.input_hash=h AND j.insight IS NOT NULL) THEN UPDATE ci_jobs SET status='ready',lease_until=NULL WHERE user_id=j.user_id AND customer_key=j.customer_key AND period=j.period;RETURN NULL;END IF;
 UPDATE ci_usage SET calls=calls+1 WHERE user_id=j.user_id AND day=(now() AT TIME ZONE 'UTC')::date;
 UPDATE ci_jobs SET status='processing',input_hash=h,attempts=attempts+1,lease_until=now()+interval '10 minutes' WHERE user_id=j.user_id AND customer_key=j.customer_key AND period=j.period;
 RETURN jsonb_build_object('user_id',j.user_id::text,'customer_key',j.customer_key,'period',j.period,'revision',j.revision,'input_hash',h,'messages',payload);
END$$;
REVOKE ALL ON FUNCTION public.ci_queue_message(),public.ci_seed_jobs(bigint),public.ci_claim_job() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ci_queue_message(),public.ci_seed_jobs(bigint),public.ci_claim_job() TO service_role;
CREATE OR REPLACE FUNCTION public.ci_dashboard(p_owner bigint,p_product text DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
WITH meaningful AS (
 SELECT e.* FROM ci_messages e WHERE e.user_id=p_owner AND e.kind='customer' AND length(e.text)>=4
 AND e.text NOT IN ('팔로우 했어요','팔로우했어요')
 AND NOT EXISTS(SELECT 1 FROM automations a WHERE a.user_id=p_owner AND a.trigger_type='keyword' AND lower(trim(a.trigger_value))=lower(trim(e.text)))
 AND(p_product IS NULL OR EXISTS(SELECT 1 FROM ci_products p,unnest(p.keywords) w WHERE p.user_id=p_owner AND p.product_key=p_product AND e.text ILIKE '%'||w||'%'))
), topics AS (
 SELECT tag,count(*) AS mentions,count(distinct customer_key) AS customers,
 count(*) FILTER(WHERE occurred_at>=now()-interval '7 days') AS this_week,
 count(*) FILTER(WHERE occurred_at>=now()-interval '14 days' AND occurred_at<now()-interval '7 days') AS last_week,
 count(distinct customer_key) FILTER(WHERE text ~ '(구매|결제|신청).*(링크|방법|어떻게|할게|가능|문의|하고싶)') AS intent_customers,
 (array_agg(event_key ORDER BY occurred_at DESC))[1:3] AS evidence_keys,
 (array_agg(text ORDER BY occurred_at DESC))[1:3] AS quotes
 FROM meaningful CROSS JOIN LATERAL (VALUES
 ('아이템 선정','(아이템|뭘 만들|뭘만들|무엇을 만들|카테고리|주제)'),('실행·미루기','(실행|미루|시작|손이 안|정체)'),('초보·실력','(초보|실력|따라갈|할 수 있|할수있)'),('시간 부족','(시간|육아|직장|바빠)'),('가격','(가격|금액|비싸|할부|할인)'),('Etsy 입점','(입점|정지|엣시|Etsy|etsy)'),('툴·자동화','(자동화|인디자인|캔바|툴|하이퍼링크)'),('상품 선택','(뭐가 다|차이|어떤.*(강의|상품|패키지))'),('완벽주의·불안','(완벽|불안|걱정|무서|틀릴|자신)')) AS labels(tag,pattern)
 WHERE text ~ pattern GROUP BY tag
), exact_words AS (
 SELECT text,count(*) AS mentions,count(distinct customer_key) AS customers,(array_agg(event_key ORDER BY occurred_at DESC))[1] AS evidence_key
 FROM meaningful WHERE length(text) BETWEEN 12 AND 300 GROUP BY text ORDER BY count(distinct customer_key) DESC,count(*) DESC LIMIT 15
), customers AS (
 SELECT customer_key,(array_agg(label ORDER BY occurred_at DESC))[1] AS label,count(*) AS messages,max(occurred_at) AS last_at,
 count(*) FILTER(WHERE direction='incoming') AS incoming FROM ci_messages WHERE user_id=p_owner GROUP BY customer_key ORDER BY max(occurred_at) DESC LIMIT 50
), revenue AS (SELECT currency,count(*) AS purchases,sum(amount-refunded_amount) AS amount FROM ci_purchases WHERE user_id=p_owner AND status='paid' GROUP BY currency)
SELECT jsonb_build_object(
 'summary',(SELECT jsonb_build_object('messages',count(*),'customers',count(distinct customer_key),'customer_messages',count(*) FILTER(WHERE kind='customer'),'automation',count(*) FILTER(WHERE kind='automation'),'automation_suspected',count(*) FILTER(WHERE kind='automation_suspected'),'system',count(*) FILTER(WHERE kind='system'),'unknown',count(*) FILTER(WHERE direction='unknown')) FROM ci_messages WHERE user_id=p_owner),
 'topics',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY customers*(1+intent_customers::numeric/greatest(customers,1)) DESC) FROM topics t),'[]'),
 'exact_words',coalesce((SELECT jsonb_agg(to_jsonb(w)) FROM exact_words w),'[]'),
 'customers',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM customers c),'[]'),
 'ai', (SELECT jsonb_build_object('ready',count(*) FILTER(WHERE status='ready' AND insight IS NOT NULL),'pending',count(*) FILTER(WHERE status='pending'),'errors',count(*) FILTER(WHERE status='error')) FROM ci_jobs WHERE user_id=p_owner),
 'insights',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT customer_key,period,insight,model,updated_at FROM ci_jobs WHERE user_id=p_owner AND status='ready' AND insight IS NOT NULL ORDER BY updated_at DESC LIMIT 20)q),'[]'),
 'revenue',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM revenue r),'[]'),
 'clicks',(SELECT count(*) FROM ci_clicks WHERE user_id=p_owner),
 'attributed_purchases',(SELECT count(*) FROM ci_purchases WHERE user_id=p_owner AND click_id IS NOT NULL AND status='paid'),
 'purchase_tracking_connected',EXISTS(SELECT 1 FROM ci_purchases WHERE user_id=p_owner),
 'products',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM ci_products p WHERE user_id=p_owner),'[]')
);
$$;
REVOKE ALL ON FUNCTION public.ci_dashboard(bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ci_dashboard(bigint,text) TO service_role;
