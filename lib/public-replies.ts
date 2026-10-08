export const DEFAULT_PUBLIC_REPLIES: string[] = [
  "디엠으로 보내드렸어요 💌",
  "디엠 확인해 주세요 🌸",
  "링크 보내드렸어요 🥰",
  "보내드렸습니다 🤍",
  "구매링크 보내드렸어요 💌",
  "프리미엄 비밀키트 링크 전달 드렸어요 📝",
  "디엠 못 받으신 분들은 숨김함 먼저 확인해 주세요 :) 그래도 없다면 팔로우 후 디엠으로 ‘키트재입고’라고 보내주시면. 자동으로 받아보실 수 있어요 🙏🏻💗"
]

export function publicReplyDefaults(value: unknown): string[] {
  return Array.isArray(value) && value.length > 0 && value.every(v => typeof v === "string" && v.trim()) ? value : [...DEFAULT_PUBLIC_REPLIES]
}
