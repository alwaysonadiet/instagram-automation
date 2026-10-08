-- Derived, non-exclusive evidence. Quotes remain substrings of the original DM.
CREATE OR REPLACE FUNCTION public.ci_extract_signals(p_text text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE t text:=coalesce(p_text,''); s text; l text; result jsonb:='[]'; labels text[]; k text; outcome text; matched text[]; reported boolean;
BEGIN
 IF lower(t) ~ '(귀사의.*서비스|수익을.?배분|제휴.{0,30}제안|협찬.{0,30}제안|협업.{0,30}제안)' THEN RETURN result; END IF;
 IF trim(t)='' OR t ~* '^(reacted .+ to your message|liked (a |your )?message|Instagram 게시물의 댓글에 비공개 답장|You (sent|unsent))' THEN RETURN result; END IF;
 FOR s IN SELECT trim(x) FROM regexp_split_to_table(t,E'[\\n\\r]+|(?<=[.!?。？！])\\s+') x LOOP
  l:=lower(s); labels:=ARRAY[]::text[];
  IF length(regexp_replace(l,'[^가-힣a-z0-9]','','g'))<5 THEN CONTINUE; END IF;
  -- Judge each reported result locally. A wish elsewhere must not erase a real sale.
  reported:=false;
  FOR matched IN SELECT regexp_matches(l,
   '(.{0,35})((?:첫.?(?:판매|매출|주문|세일).{0,14}(?:났|나왔|되었|됐|일어났|했어요|했습니다|하였습니다|했었|맛.?본|발생했|발생하여))|(?:(?:판매|매출|수익|주문|수입).{0,12}(?:판매했|판매.?되서|판매.?돼서|늘어|늘었|올랐|발생했|발생하여|되고.?있|나고.?있))|(?:판매.{0,6}(?:했었|했어요|했습니다|되서|됐|되었))|(?:팔렸|팔았|소소하게.?팔려)|(?:[0-9]+[ ]*(?:세일|주문|판매).{0,8}(?:해서|했|달성|넘었))|(?:[0-9]+[ ]*(?:만.?원|달러|불).{0,12}(?:벌고|벌었))|(?:(?:스타.?셀러|베스트셀러|스타샵).{0,15}(?:달았|달아서|붙었|받았|됐|되었)))(.{0,30})','g') LOOP
    IF matched[2] !~ '(안|못|않|지지부진)'
      AND matched[1] !~ '(못.?$|안.?$|님이.{0,20}$|남들이.{0,20}$|셀러님이.{0,20}$|했으면.{0,30}$|되면.{0,25}$|목표.{0,20}$)'
      AND matched[3] !~ '^(었겠|나|는지|을까|으면|다면|겠|면|.{0,5}(싶|주면|줬으면|날까요|가능할|할까요))'
      AND matched[1]||matched[2]||matched[3] !~ '(기획|seller.*verify|하셨|했다고.?하|되었다고.?하|들려드릴|드릴게요|목표)' THEN
      reported:=true; EXIT;
    END IF;
  END LOOP;
  IF reported THEN labels:=array_append(labels,'testimonial'); END IF;
  IF l ~ '(완성|완료|출시|오픈|개설|입점|리스팅|등록|실행|만들|도움|자신감|해결|달라|배웠|배우게)' AND
    l ~ '(했어요|했습니다|했어|했습|하게.?됐|하게.?되었|되었|됐어요|됐습니다|생겼|많이.?됐|많이.?되었|해결됐|달라졌|완성했|완료했|만들었)' AND
    l !~ '(싶|바라|목표|했으면|되면)' THEN labels:=array_append(labels,'progress'); END IF;
  IF l ~ '(좋았|좋아요|유익|도움|만족|추천|재밌|재미있|쉽게|이해|자신감)' AND l ~ '(강의|수업|키트|노트|캠프|덕분|배우|설명|내용)' THEN labels:=array_append(labels,'feedback'); END IF;
  IF l ~ '(비싸|비싼|부담|할부|무이자|무리|망설|돈이.?없|수입이.?없|수익이.?없|따라갈|초보.{0,50}(걱정|가능|괜찮)|실력.{0,35}(걱정|없)|시간.{0,45}(없|부족)|육아.{0,45}(병행|가능|힘)|직장.{0,45}(병행|가능)|구매.{0,45}고민|결제.{0,45}고민)' THEN labels:=array_append(labels,'objection'); END IF;
  IF l ~ '(아이템|뭘|무엇|카테고리|시장조사|디자인|실행|시작|입점|판매|매출|수익화|수익|엣시|etsy|완벽|자신|결정|리스팅|캔바).{0,90}(모르|못|어렵|막막|두렵|무서|정체|미루|안.?돼|안.?되|안.?나|없|걱정|실패)' OR l ~ '(미루고|미루게|시작이 안|실행이 안|손이 안|뭘 골라도|결정을 못|결정장애|완벽주의|못.?벌|안.?팔)' THEN labels:=array_append(labels,'problem'); END IF;
  IF l ~ '(부업|수익|수입|매출|판매|엣시|etsy|상품|디자인|아이템|실행|시간|자동화|리스팅|상점|성장|도전|만들).{0,100}(싶|원해|원하|목표|바라|줬으면|주었으면)' OR l ~ '(벌고.?싶|성장하고.?싶|도전하고.?싶)' THEN labels:=array_append(labels,'desire'); END IF;
  -- Only local technical failure wording; a distant '못 벌었어요' is not a download failure.
  IF l ~ '(로그인|다운로드|접속|파일|링크|쿠폰|결제|시청).{0,25}(오류|에러|안.?돼|안.?되|실패|열리지|안.?열|못.?하|안.?보)' OR l ~ '(환불|취소).{0,35}(요청|하고|가능|해주세요)' THEN labels:=array_append(labels,'support'); END IF;
  IF l ~ '(구매|결제|신청|등록).{0,25}(완료|했어요|했습니다|햇어요|했어용|했습|해뒀|해두었)' THEN labels:=array_append(labels,'purchase_report'); END IF;
  IF (l ~ '[?？]' AND l ~ '(강의|상품|수강|구매|결제|키트|노트|캠프|엣시|etsy|아이템|디자인|캔바|자동화|입점|가격|비용|할부|리스팅|판매|수익|기간|과제)') OR l ~ '(알려주|궁금|문의|어떻게|얼마인가|언제.{0,50}(열|오픈|시작|구매)|어디.{0,40}(구매|결제|신청)|가능할|가능한가|가능한지|있나요|인가요|되나요|될까요|뭔가요|차이점|수강료)' THEN labels:=array_append(labels,'question'); END IF;
  FOREACH k IN ARRAY labels LOOP result:=result||jsonb_build_array(jsonb_build_object('kind',k,'quote',s)); END LOOP;
 END LOOP;
 RETURN result;
END$$;
REVOKE ALL ON FUNCTION public.ci_extract_signals(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ci_extract_signals(text) TO service_role;
ALTER TABLE public.ci_history_index ADD COLUMN IF NOT EXISTS feedback_signals jsonb NOT NULL DEFAULT '[]';
CREATE OR REPLACE FUNCTION public.ci_classify_history_index() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 NEW.feedback_signals:=CASE WHEN NEW.direction='incoming' THEN ci_extract_signals(NEW.display_text) ELSE '[]'::jsonb END;
 NEW.feedback_kind:=ci_feedback_kind(NEW.display_text);
 RETURN NEW;
END$$;
-- Keep the legacy exclusive kind for existing jobs, but no longer drop long feedback as a greeting.
CREATE OR REPLACE FUNCTION public.ci_feedback_kind(p_text text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE t text:=lower(trim(coalesce(p_text,''))); k text; compact text;
BEGIN
 SELECT x->>'kind' INTO k FROM jsonb_array_elements(ci_extract_signals(t)) x ORDER BY CASE x->>'kind' WHEN 'testimonial' THEN 0 WHEN 'problem' THEN 1 WHEN 'objection' THEN 2 WHEN 'desire' THEN 3 WHEN 'question' THEN 4 WHEN 'support' THEN 5 ELSE 6 END LIMIT 1;
 IF k IS NOT NULL THEN RETURN CASE WHEN k IN ('progress','feedback') THEN 'testimonial' ELSE k END; END IF;
 IF t='' OR t ~ '^\[(첨부|사진|동영상|오디오|파일|attachment|media)' THEN RETURN 'no_text'; END IF;
 IF t ~ '^(reacted .+ to your message|liked (a |your )?message|sent (an? )?(attachment|photo|video)|you (sent|unsent)|.*님이 메시지에 .*(반응|공감)|instagram 게시물의 댓글에 비공개 답장)' THEN RETURN 'reaction'; END IF;
 compact:=regexp_replace(t,'[^가-힣a-z0-9]','','g');
 IF compact='' THEN RETURN 'reaction'; END IF;
 IF length(compact)<35 AND compact ~ '^팔로우(했어요|했습니다|했어용|완료|했습|했어)' THEN RETURN 'trigger'; END IF;
 IF length(t)<130 AND t ~ '(확인|읽기|읽어|일정|연락|답변|답장).*(연락드릴|연락 드릴|확인하|확인해|확인할|드릴게|드리겠|못했|못햇|못 했|못 햇)' THEN RETURN 'followup'; END IF;
 IF length(t)<80 AND (t ~ '(감사|고맙|좋은.*(하루|주말|저녁)|즐거운.*(주말|하루)|안녕하세요|안녕하세용|수고하세요|고생하세요)' OR compact ~ '^(네|넵|넹|예|응|오케이|ok|okay|thankyou|thanks|ㅎㅎ|ㅋㅋ)+$') THEN RETURN 'courtesy'; END IF;
 RETURN 'unclear';
END$$;
-- Customer-only read path: no outbound template matching or second archive join.
CREATE OR REPLACE VIEW public.ci_evidence_messages WITH(security_invoker=true) AS
WITH incoming AS (
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
 SELECT 'history:'||a.source_key AS archive_key,'api:'||b.id AS live_key,
 count(*) OVER(PARTITION BY a.user_id,a.source_key) AS archive_matches,
 count(*) OVER(PARTITION BY b.user_id,b.id) AS live_matches
 FROM ci_history_index a JOIN messages b ON b.user_id=a.user_id AND b.is_from_instagram
 AND b.content=a.display_text
 AND b.created_at BETWEEN a.sent_at-interval '10 seconds' AND a.sent_at+interval '10 seconds'
 WHERE a.direction='incoming' AND length(a.display_text)>=80

), classified AS (
 SELECT incoming.*,CASE WHEN EXISTS(SELECT 1 FROM automations a WHERE a.user_id=incoming.user_id AND a.trigger_type='keyword' AND lower(trim(a.trigger_value))=lower(trim(incoming.text))) THEN 'trigger' WHEN feedback_kind='unclear' AND EXISTS(SELECT 1 FROM ci_keyword_only k WHERE k.user_id=incoming.user_id AND k.token=lower(trim(incoming.text))) THEN 'keyword_only' ELSE feedback_kind END AS quality_kind FROM incoming LEFT JOIN duplicate_pairs d ON d.archive_key=incoming.event_key AND d.archive_matches=1 AND d.live_matches=1 WHERE d.archive_key IS NULL
)
SELECT user_id,event_key,customer_key,label,occurred_at,direction,text,original_text,attachments,kind,source,feedback_kind,quality_kind,CASE WHEN quality_kind IN ('reaction','trigger','keyword_only') THEN '[]'::jsonb ELSE derived_signals END AS signals FROM classified;
REVOKE ALL ON public.ci_evidence_messages FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ci_evidence_messages TO service_role;

CREATE OR REPLACE FUNCTION public.ci_evidence_library(p_owner bigint,p_days integer DEFAULT 0,p_product text DEFAULT NULL,p_scope text DEFAULT 'marketing',p_search text DEFAULT '',p_offset integer DEFAULT 0,p_topic text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public SET jit=off SET work_mem='16MB' SET plan_cache_mode='force_custom_plan' AS $$
DECLARE payload jsonb; BEGIN
 -- Bind request values before planning; do not concatenate user input.
 EXECUTE $ci_query$
WITH owned AS MATERIALIZED (
 SELECT event_key,customer_key,text,quality_kind,occurred_at,signals,jsonb_array_length(attachments) AS attachment_count FROM ci_evidence_messages WHERE user_id=$1
 AND ($2=0 OR occurred_at>=now()-make_interval(days=>least(greatest($2,1),3650)))
 AND ($3 IS NULL OR EXISTS(SELECT 1 FROM ci_products p,unnest(p.keywords) w WHERE p.user_id=$1 AND p.product_key=$3 AND text ILIKE '%'||w||'%'))
), matched AS MATERIALIZED (
 SELECT *, (SELECT jsonb_agg(s) FROM jsonb_array_elements(signals) s WHERE CASE $4
 WHEN 'all' THEN true WHEN 'testimonial' THEN s->>'kind'='testimonial' WHEN 'progress' THEN s->>'kind' IN ('progress','feedback')
 WHEN 'support' THEN s->>'kind'='support' WHEN 'objection' THEN s->>'kind'='objection'
 ELSE s->>'kind' IN ('problem','desire','question') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(signals) barrier WHERE barrier->>'kind'='objection' AND barrier->>'quote'=s->>'quote') END) AS selected_signals
 FROM owned WHERE ($5='' OR strpos(lower(text),lower($5))>0)
 AND ($7 IS NULL OR text ~ CASE $7 WHEN 'item' THEN '(아이템|카테고리|뭘.?만들|뭘.?팔)' WHEN 'execution' THEN '(실행|시작|미루|완벽|결정)' WHEN 'beginner' THEN '(초보|실력|따라갈|자신)' WHEN 'time' THEN '(시간|육아|직장|과제)' WHEN 'price' THEN '(가격|금액|부담|할부|수입|수강료)' WHEN 'etsy' THEN '(입점|정지|엣시|etsy)' WHEN 'sales' THEN '(판매|매출|수익|주문)' WHEN 'research' THEN '(시장조사|디자인|캔바)' WHEN 'access' THEN '(다운로드|로그인|파일|접속|환불|취소)' WHEN 'schedule' THEN '(언제|기간|오픈|재입고|신청|구매)' WHEN 'automation' THEN '(인디자인|하이퍼링크|자동화|툴)' WHEN 'choice' THEN '(차이|강의|상품|패키지|노트|키트)' ELSE '(?!)' END)
), eligible AS MATERIALIZED (SELECT * FROM matched WHERE selected_signals IS NOT NULL OR $4='all'), page AS (
 SELECT event_key,customer_key,text,quality_kind,occurred_at,coalesce(selected_signals,signals) AS signals,attachment_count
 FROM eligible ORDER BY occurred_at DESC,event_key DESC LIMIT 25 OFFSET least(greatest($6,0),100000)
)
SELECT jsonb_build_object('total',(SELECT count(*) FROM eligible),'items',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM page p),'[]'),'media_unread',(SELECT count(*) FROM owned WHERE attachment_count>0),'scope_counts',(SELECT coalesce(jsonb_object_agg(k,n),'{}') FROM (SELECT s->>'kind' AS k,count(distinct event_key) n FROM owned CROSS JOIN LATERAL jsonb_array_elements(signals) s GROUP BY s->>'kind') counts));
$ci_query$ INTO payload USING p_owner,p_days,p_product,p_scope,p_search,p_offset,p_topic;
 RETURN payload;
END$$;
REVOKE ALL ON FUNCTION public.ci_evidence_library(bigint,integer,text,text,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ci_evidence_library(bigint,integer,text,text,text,integer,text) TO service_role;
