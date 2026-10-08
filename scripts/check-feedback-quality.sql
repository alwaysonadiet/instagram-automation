-- Synthetic acceptance fixtures: noise is excluded, mixed substantive messages survive.
WITH cases(text,expected) AS (VALUES
 ('Reacted 😮 to your message','reaction'),
 ('❤','reaction'),
 ('아 죄송해요 일정이잇어서 읽기만 하고 확인은 못햇네요! 확인하구 연락드릴게요!','followup'),
 ('네 감사합니다 ❤ 즐거운 주말 보내세요!','courtesy'),
 ('팔로우 했어요 🫶🏻','trigger'),
 ('감사합니다 그런데 초보도 따라갈 수 있나요?','objection'),
 ('감사해요! 다운로드가 안돼요','support'),
 ('첫 판매가 났어요! 정말 감사합니다','testimonial'),
 ('가격이 너무 비싸서 부담돼요','objection'),
 ('뭘 만들어야 할지 모르겠어요','problem'),
 ('머리로는 아는데 손이 안 움직여요','problem'),
 ('디지털 파일 판매로 수익을 늘리고 싶어요','desire'),
 ('수강료가 얼마인가요?','question'),
 ('구매 완료했습니다','purchase_report'),
 ('잘 지내시죠? 감사합니다','courtesy'),
 ('맥락 없이 남긴 한마디','unclear')
) SELECT count(*) AS fixtures,count(*) FILTER(WHERE ci_feedback_kind(text)<>expected) AS failures FROM cases;
