-- Regression cases for mixed customer feedback, unrelated past tense, and wishes.
DO $$
DECLARE f record; actual jsonb;
BEGIN
 FOR f IN SELECT * FROM (VALUES
 ('비밀노트 수강 후 샵을 열었습니다. 4달 동안 10만원도 못 벌어서 성장하고 싶어요. 과제 시간은 얼마나 되나요?',ARRAY['problem','desire','question'],ARRAY['support','testimonial']),
 ('자동화를 사고 싶지만 현재 수입이 없는 상황이라 12개월도 무리예요.',ARRAY['objection'],ARRAY['testimonial']),
 ('네 감사합니다 ❤ 즐거운 주말 보내세요!',ARRAY[]::text[],ARRAY['testimonial','problem','question']),
 ('Reacted 😮 to your message',ARRAY[]::text[],ARRAY['question','problem']),
 ('확인하고 연락드릴게요!',ARRAY[]::text[],ARRAY['problem','question']),
 ('수익이 올라줬으면 좋겠어요.',ARRAY['desire'],ARRAY['testimonial']),
 ('첫 판매가 발생했어요. 요즘 판매가 늘어가요!',ARRAY['testimonial'],ARRAY['support']),
 ('강의 듣고 첫 상품을 완성했어요. 감사합니다!',ARRAY['progress'],ARRAY['support']),
 ('판매가 안되고 있어요.',ARRAY['problem'],ARRAY['testimonial']),
 ('학원에 600만원 투자했는데 수익화에 실패했어요.',ARRAY['problem'],ARRAY['testimonial']),
 ('첫판매 하고 소식 들려드릴게요.',ARRAY[]::text[],ARRAY['testimonial']),
 ('저는 샵을 연 뒤 8세일을 해서 기쁘지만 아직 초보라 계속 할 수 있을지 걱정이에요.',ARRAY['testimonial','objection'],ARRAY['support'])
 ) x(txt,expected,absent) LOOP
  actual:=ci_extract_signals(f.txt);
  IF EXISTS(SELECT 1 FROM unnest(f.expected) k WHERE NOT(actual @> jsonb_build_array(jsonb_build_object('kind',k)))) THEN RAISE EXCEPTION 'Missing meaningful evidence: %',f.txt; END IF;
  IF EXISTS(SELECT 1 FROM unnest(f.absent) k WHERE actual @> jsonb_build_array(jsonb_build_object('kind',k))) THEN RAISE EXCEPTION 'False evidence: %',f.txt; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(actual) s WHERE strpos(f.txt,s->>'quote')=0) THEN RAISE EXCEPTION 'Quote modified'; END IF;
 END LOOP;
END$$;
