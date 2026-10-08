CREATE OR REPLACE FUNCTION public.ci_dashboard_v2(p_owner bigint,p_product text DEFAULT NULL,p_days integer DEFAULT 0,p_scope text DEFAULT 'marketing') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public SET jit=off SET work_mem='16MB' SET plan_cache_mode='force_custom_plan' AS $$
DECLARE payload jsonb; BEGIN
 -- Bind request values before planning; do not concatenate user input.
 EXECUTE $ci_query$
WITH owned AS MATERIALIZED (
 SELECT user_id,event_key,customer_key,label,occurred_at,direction,text,kind,quality_kind,signals FROM ci_evidence_messages WHERE user_id=$1
 AND ($3=0 OR occurred_at>=now()-make_interval(days=>least(greatest($3,1),3650)))
 AND ($2 IS NULL OR EXISTS(SELECT 1 FROM ci_products p,unnest(p.keywords) w WHERE p.user_id=$1 AND p.product_key=$2 AND text ILIKE '%'||w||'%'))
), signals AS MATERIALIZED (
 SELECT *, (SELECT jsonb_agg(s) FROM jsonb_array_elements(signals) s WHERE CASE $4 WHEN 'support' THEN s->>'kind'='support' WHEN 'testimonial' THEN s->>'kind'='testimonial' WHEN 'progress' THEN s->>'kind' IN ('progress','feedback') WHEN 'objection' THEN s->>'kind'='objection' ELSE s->>'kind' IN ('problem','desire','objection','question') END) AS selected_signals FROM owned WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(signals) s WHERE CASE $4 WHEN 'support' THEN s->>'kind'='support' WHEN 'testimonial' THEN s->>'kind'='testimonial' WHEN 'progress' THEN s->>'kind' IN ('progress','feedback') WHEN 'objection' THEN s->>'kind'='objection' ELSE s->>'kind' IN ('problem','desire','objection','question') END)
), rules(tag,title,pattern,next_action) AS (VALUES
 ('item','어떤 아이템으로 시작할지 모르겠어요','(아이템|카테고리|뭘.?만들|무엇을.?만들|뭘.?팔|주제.?선정)','선택 기준과 첫 상품 예시를 콘텐츠로 설명하세요.'),
 ('execution','알지만 시작·실행이 안 돼요','(미루|실행.*(못|안|어렵|정체)|시작.*(못|안|어렵)|손이.?안|완벽주의|결정을.?못)','작게 시작하는 방법과 오늘 할 행동을 보여주세요.'),
 ('beginner','초보도 따라갈 수 있을까요?','(초보|따라갈|실력.*(없|걱정)|할.?수.?있.*(걱정|궁금)|자신.*없)','필요한 기초·난이도·지원 범위를 FAQ에 명확히 쓰세요.'),
 ('time','직장·육아와 병행할 수 있을까요?','((시간|육아|직장).*(없|부족|병행|가능|바빠|힘)|하루.*(시간|분).*가능)','실제 필요한 시간과 가능한 진행 속도를 안내하세요.'),
 ('price','가격·할부 때문에 망설여요','(가격|금액|비싸|부담|할부|무이자|수강료|비용)','가격·할부·포함 범위를 판매 페이지와 FAQ에서 설명하세요.'),
 ('etsy','Etsy 입점·정지가 걱정돼요','(입점|정지|국가.*등록|엣시.*(가입|열|개설)|etsy.*(가입|열|개설))','입점 조건과 확인할 공식 정책을 안내하세요.'),
 ('choice','어떤 강의·패키지를 골라야 하나요?','(차이|뭐가.?다|어떤.*(강의|상품|패키지)|노트.*키트|키트.*노트|평생.*(차이|포함))','누구에게 어떤 상품이 맞는지 비교 FAQ를 만드세요.'),
 ('sales','판매·수익이 나지 않아요','((판매|매출|수익|주문).*(안|없|못|늘|어렵)|첫.?판매|첫.?매출|첫.?주문)','과장된 보장 없이 실제 사례와 개선 과정을 보여주세요.'),
 ('research','시장조사·디자인에서 막혀요','(시장조사|디자인.*(못|어렵|모르)|캔바.*(못|어렵|모르))','막히는 단계 하나를 골라 예시와 해결 절차를 보여주세요.'),
 ('access','파일·수강·결제 사용에 문제가 있어요','(다운로드|로그인|접속|파일|시청|환불|취소|결제.*(안|오류))','고객 지원 FAQ와 안내 메시지를 먼저 개선하세요.'),
 ('schedule','언제·어디서 구매하고 시작하나요?','(언제.*(오픈|시작|구매|수강)|구매.*(링크|방법|어디|가능)|신청.*(방법|언제|가능)|재입고|수강.*(기간|평생|시작)|오픈.*(날짜|일정|예정))','구매 링크·오픈 일정·수강 기간을 FAQ와 안내 메시지에 명확히 적으세요.'),
 ('automation','툴·자동화 사용이 궁금해요','(인디자인|하이퍼링크|자동화|툴.*(사용|방법))','관련 사용 안내를 보완하세요. 판매 종료 상품은 재판매로 연결하지 마세요.')
), hits AS MATERIALIZED (
 SELECT s.event_key,s.customer_key,s.occurred_at,s.text,s.quality_kind,s.selected_signals,r.tag FROM signals s JOIN rules r ON EXISTS(SELECT 1 FROM jsonb_array_elements(s.selected_signals) e WHERE e->>'quote' ~ r.pattern)
), theme_orders AS (
 SELECT r.tag,p.order_key,p.currency,p.amount-p.refunded_amount AS amount FROM rules r JOIN ci_purchases p ON p.user_id=$1 AND p.status='paid'
 WHERE EXISTS(SELECT 1 FROM hits h WHERE h.tag=r.tag AND h.customer_key=p.customer_key AND h.occurred_at<=p.paid_at AND h.occurred_at>=p.paid_at-interval '30 days')
), topics AS (
 SELECT r.tag,r.title,r.next_action,count(*) AS mentions,count(distinct h.customer_key) AS conversations,
 count(distinct h.customer_key) FILTER(WHERE h.occurred_at>=now()-interval '7 days') AS this_week,
 count(distinct h.customer_key) FILTER(WHERE h.occurred_at>=now()-interval '14 days' AND h.occurred_at<now()-interval '7 days') AS last_week,
 count(distinct h.customer_key) FILTER(WHERE h.text ~ '(구매|결제|신청).*(링크|방법|어떻게|할게|가능|문의|하고.?싶|하려)') AS intent_conversations,
 (SELECT count(*) FROM theme_orders p WHERE p.tag=r.tag) AS orders,
 coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM(SELECT currency,sum(amount) AS amount FROM theme_orders p WHERE p.tag=r.tag GROUP BY currency)m),'[]') AS revenue,
 (SELECT jsonb_agg(to_jsonb(e)) FROM(SELECT event_key,customer_key,text,quality_kind,occurred_at,selected_signals AS signals FROM hits x WHERE x.tag=r.tag ORDER BY occurred_at DESC LIMIT 3)e) AS examples
 FROM hits h JOIN rules r USING(tag) GROUP BY r.tag,r.title,r.next_action
), types AS (SELECT s->>'kind' AS quality_kind,count(distinct event_key) AS messages,count(distinct customer_key) AS conversations FROM owned CROSS JOIN LATERAL jsonb_array_elements(signals) s GROUP BY s->>'kind'), examples AS (
 SELECT event_key,customer_key,text,quality_kind,occurred_at,selected_signals AS signals FROM signals ORDER BY occurred_at DESC LIMIT 24
)
SELECT jsonb_build_object(
 'summary',(SELECT jsonb_build_object('raw',(SELECT count(*) FROM ci_history_index WHERE user_id=$1)+(SELECT count(*) FROM messages WHERE user_id=$1),'incoming',count(*) FILTER(WHERE kind='customer'),'excluded',count(*) FILTER(WHERE kind='customer' AND quality_kind IN ('reaction','courtesy','followup','trigger','keyword_only','no_text')),'unclear',count(*) FILTER(WHERE kind='customer' AND quality_kind='unclear'),'signals',(SELECT count(*) FROM signals),'conversations',(SELECT count(distinct customer_key) FROM signals),'media_unread',(SELECT count(*) FROM ci_evidence_messages WHERE user_id=$1 AND jsonb_array_length(attachments)>0),'unmapped',(SELECT count(*) FROM signals s LEFT JOIN (SELECT DISTINCT event_key FROM hits) h USING(event_key) WHERE h.event_key IS NULL)) FROM owned),
 'categories',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM types t),'[]'),
 'topics',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY orders DESC,intent_conversations DESC,conversations DESC) FROM topics t),'[]'),
 'examples',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM examples e),'[]'),
 'products',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM ci_products p WHERE p.user_id=$1),'[]'),
 'ai',(SELECT jsonb_build_object('ready',count(*) FILTER(WHERE status='ready' AND insight IS NOT NULL AND schema_version=2),'pending',count(*) FILTER(WHERE status='pending'),'errors',count(*) FILTER(WHERE status='error')) FROM ci_jobs WHERE user_id=$1),
 'insights',coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM(SELECT customer_key,period,insight FROM ci_jobs WHERE user_id=$1 AND status='ready' AND schema_version=2 AND insight IS NOT NULL ORDER BY updated_at DESC LIMIT 10)i),'[]'),
 'purchase_tracking_connected',EXISTS(SELECT 1 FROM ci_purchases WHERE user_id=$1 AND source='verified_webhook')
);
$ci_query$ INTO payload USING p_owner,p_product,p_days,p_scope;
 RETURN payload;
END$$;
REVOKE ALL ON FUNCTION public.ci_dashboard_v2(bigint,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ci_dashboard_v2(bigint,text,integer,text) TO service_role;
