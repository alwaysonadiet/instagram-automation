ALTER TABLE public.ci_purchases ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'paid' CHECK(status IN ('paid','refunded','cancelled','failed'));
ALTER TABLE public.ci_purchases ADD COLUMN IF NOT EXISTS refunded_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK(refunded_amount>=0);
CREATE OR REPLACE FUNCTION public.ci_conversion_learning(p_owner bigint) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
WITH performance AS (
 SELECT c.id,c.title,c.format,c.evidence_keys,count(distinct x.id) AS requests,
 count(distinct p.click_id) FILTER(WHERE p.status='paid' AND p.amount>p.refunded_amount) AS paid_clicks,
 count(distinct p.order_key) FILTER(WHERE p.status='paid' AND p.amount>p.refunded_amount) AS orders
 FROM ci_content c LEFT JOIN ci_links l ON l.content_id=c.id AND l.user_id=p_owner
 LEFT JOIN ci_clicks x ON x.slug=l.slug AND x.user_id=p_owner
 LEFT JOIN ci_purchases p ON p.click_id=x.id AND p.user_id=p_owner
 WHERE c.user_id=p_owner GROUP BY c.id
), revenue AS (
 SELECT l.content_id,p.currency,sum(p.amount-p.refunded_amount) AS amount FROM ci_purchases p
 JOIN ci_clicks x ON x.id=p.click_id AND x.user_id=p.user_id JOIN ci_links l ON l.slug=x.slug AND l.user_id=p.user_id
 WHERE p.user_id=p_owner AND p.status='paid' GROUP BY l.content_id,p.currency
)
SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY orders DESC,paid_clicks DESC,requests DESC),'[]') FROM (
 SELECT f.*,coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM revenue r WHERE r.content_id=f.id),'[]') AS revenue,
 CASE WHEN requests>0 THEN round(paid_clicks::numeric/requests*100,2) ELSE NULL END AS request_purchase_rate
 FROM performance f
) s;
$$;
REVOKE ALL ON FUNCTION public.ci_conversion_learning(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ci_conversion_learning(bigint) TO service_role;
