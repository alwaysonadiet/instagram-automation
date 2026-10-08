CREATE OR REPLACE FUNCTION public.ci_workspace(p_owner bigint) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public SET jit=off AS $$
WITH customers AS (
 SELECT customer_key,(array_agg(label ORDER BY occurred_at DESC))[1] AS label,count(*) AS messages,max(occurred_at) AS last_at,
 count(*) FILTER(WHERE direction='incoming') AS incoming FROM ci_messages WHERE user_id=p_owner GROUP BY customer_key ORDER BY max(occurred_at) DESC LIMIT 50
), revenue AS (SELECT currency,count(*) AS purchases,sum(amount-refunded_amount) AS amount FROM ci_purchases WHERE user_id=p_owner AND status='paid' GROUP BY currency)
SELECT jsonb_build_object('customers',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM customers c),'[]'),
 'products',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM ci_products p WHERE user_id=p_owner),'[]'),
 'revenue',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM revenue r),'[]'),
 'clicks',(SELECT count(*) FROM ci_clicks WHERE user_id=p_owner),
 'attributed_purchases',(SELECT count(*) FROM ci_purchases WHERE user_id=p_owner AND click_id IS NOT NULL AND status='paid'),
 'purchase_tracking_connected',EXISTS(SELECT 1 FROM ci_purchases WHERE user_id=p_owner AND source='verified_webhook'));
$$;
REVOKE ALL ON FUNCTION public.ci_workspace(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ci_workspace(bigint) TO service_role;
