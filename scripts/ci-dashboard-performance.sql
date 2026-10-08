CREATE OR REPLACE FUNCTION public.ci_dashboard(p_owner bigint,p_product text DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public SET jit=off AS $$
WITH owned AS MATERIALIZED (
 SELECT user_id,event_key,customer_key,label,occurred_at,direction,text,kind FROM ci_messages WHERE user_id=p_owner
), meaningful AS (
 SELECT e.* FROM owned e WHERE e.user_id=p_owner AND e.kind='customer' AND length(e.text)>=4
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
 count(*) FILTER(WHERE direction='incoming') AS incoming FROM owned WHERE user_id=p_owner GROUP BY customer_key ORDER BY max(occurred_at) DESC LIMIT 50
), revenue AS (SELECT currency,count(*) AS purchases,sum(amount-refunded_amount) AS amount FROM ci_purchases WHERE user_id=p_owner AND status='paid' GROUP BY currency)
SELECT jsonb_build_object(
 'summary',(SELECT jsonb_build_object('messages',count(*),'customers',count(distinct customer_key),'customer_messages',count(*) FILTER(WHERE kind='customer'),'automation',count(*) FILTER(WHERE kind='automation'),'automation_suspected',count(*) FILTER(WHERE kind='automation_suspected'),'system',count(*) FILTER(WHERE kind='system'),'unknown',count(*) FILTER(WHERE direction='unknown')) FROM owned WHERE user_id=p_owner),
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

ALTER FUNCTION public.ci_claim_job() SET jit=off;
