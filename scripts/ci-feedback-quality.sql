-- Feedback quality v2. Classifications are derived; raw DM is never edited.
CREATE OR REPLACE FUNCTION public.ci_feedback_kind(p_text text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE t text:=lower(trim(regexp_replace(coalesce(p_text,''),'[[:space:]]+',' ','g'))); compact text;
BEGIN
 IF t='' OR t ~ '^\[(첨부|사진|동영상|오디오|파일|attachment|media)' THEN RETURN 'no_text'; END IF;
 IF t ~ '^(reacted .+ to your message|liked (a |your )?message|sent (an? )?(attachment|photo|video)|you (sent|unsent)|.*님이 메시지에 .*(반응|공감)|메시지에 .*(반응|공감)|instagram 게시물의 댓글에 비공개 답장)' THEN RETURN 'reaction'; END IF;
 compact:=regexp_replace(t,'[^가-힣a-z0-9]','','g');
 IF compact='' THEN RETURN 'reaction'; END IF;
 IF compact ~ '^팔로우(했어요|했습니다|했어용|완료|했습|했어)' THEN RETURN 'trigger'; END IF;
 -- Substantive content wins over greetings / thanks in a mixed message.
 IF t ~ '(로그인|다운로드|접속|파일|링크|쿠폰|결제|환불|수강|시청).*(오류|에러|안돼|안되|안 돼|안 되|실패|못|열리지|안 열|어떻게|문의)' OR t ~ '(환불|취소).*(요청|하고|가능|해주세요)' THEN RETURN 'support'; END IF;
 IF t ~ '(첫.?판매|첫.?매출|첫.?주문|매출이|수익이|주문이).*(났|나왔|했|올랐|늘었|생겼|발생)' OR t ~ '(덕분|강의|키트|부트캠프).*(달라졌|해결됐|해결되|실행했|완성했|판매했|매출|수익)' THEN RETURN 'testimonial'; END IF;
 IF t ~ '(구매|결제|신청|등록).*(완료|했어요|했습니다|햇어요|했어용|했습|해뒀|해두었)' THEN RETURN 'purchase_report'; END IF;
 IF t ~ '(비싸|비싼|부담|할부|무이자|가격.*걱정|금액.*걱정|초보.*(걱정|따라|가능|괜찮)|따라갈.*(걱정|있|없)|실력.*(걱정|없)|시간.*(없|부족)|육아.*(병행|가능|힘)|직장.*(병행|가능)|망설|고민.*구매|살까.*고민|구매.*고민|결제.*고민|효과.*(의심|있|없)|결과.*(의심|나올))' THEN RETURN 'objection'; END IF;
 IF t ~ '(아이템|뭘|무엇|카테고리|시장조사|디자인|실행|시작|입점|판매|엣시|etsy|완벽|자신|결정|리스팅|캔바).*(모르|못하|못 하|어렵|막막|두렵|무서|정체|미루|안돼|안되|안 돼|안 되|안 나|안나|안 움직|안움직|틀릴|걱정)' OR t ~ '(미루고|미루게|시작이 안|실행이 안|손이 안|손이안|뭘 골라도|결정을 못|결정장애|완벽주의)' THEN RETURN 'problem'; END IF;
 IF t ~ '(부업|수익|매출|판매|엣시|etsy|상품|디자인|아이템|실행|시간|자동화|리스팅).*(하고.?싶|되고.?싶|원해|원하|벌고.?싶|늘리고.?싶|줄이고.?싶|목표|바라)' THEN RETURN 'desire'; END IF;
 IF (t ~ '[?？]' AND t ~ '(강의|상품|수강|구매|결제|키트|노트|부트캠프|엣시|etsy|아이템|디자인|캔바|자동화|입점|가격|비용|할부|리스팅|판매|수익)') OR t ~ '(알려주|궁금|문의|어떻게|얼마인가|언제.*(열|오픈|시작|구매)|어디.*(구매|결제|신청)|가능할|가능한가|가능한지|가능하|있나요|인가요|되나요|될까요|뭔가요|뭐가 다|차이점|비용|수강료)' THEN RETURN 'question'; END IF;
 IF t ~ '(확인|읽기|읽어|일정|연락|답변|답장).*(연락드릴|연락 드릴|확인하|확인해|확인 할|확인할|나중에|드릴게|드리겠|못했|못햇|못 했|못 햇)' OR t ~ '(확인했|확인햇|확인 했|확인 햇|알겠습니다|알겟습니다|알겠어요|알겠습|연락드릴게|확인하고 연락)' THEN RETURN 'followup'; END IF;
 IF t ~ '(감사|고맙|좋은.*(하루|주말|저녁)|즐거운.*(주말|하루)|안녕하세요|안녕하세용|수고하세요|고생하세요)' OR compact ~ '^(네|넵|넹|예|응|오케이|ok|okay|thankyou|thanks|ㅎㅎ|ㅋㅋ)+$' THEN RETURN 'courtesy'; END IF;
 RETURN 'unclear';
END$$;
REVOKE ALL ON FUNCTION public.ci_feedback_kind(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ci_feedback_kind(text) TO service_role;
ALTER TABLE public.ci_history_index ADD COLUMN IF NOT EXISTS feedback_kind text;
CREATE OR REPLACE FUNCTION public.ci_classify_history_index() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN NEW.feedback_kind:=ci_feedback_kind(NEW.display_text); RETURN NEW; END$$;
REVOKE ALL ON FUNCTION public.ci_classify_history_index() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ci_classify_history_index() TO service_role;
CREATE TRIGGER ci_history_feedback_quality BEFORE INSERT OR UPDATE OF display_text ON public.ci_history_index FOR EACH ROW EXECUTE FUNCTION public.ci_classify_history_index();
