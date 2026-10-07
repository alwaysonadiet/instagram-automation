import { unzip, strFromU8 } from "fflate"

const MAX_COMPRESSED = 200 * 1024 * 1024
const MAX_JSON = 20 * 1024 * 1024
const MAX_TOTAL_JSON = 100 * 1024 * 1024
export async function readHistoryFile(file: File): Promise<{ path: string; data: unknown }[]> {
  if (file.size > MAX_COMPRESSED) throw new Error("파일을 200MB 이하로 나눠서 가져와 주세요.")
  if (/\.json$/i.test(file.name)) {
    if (file.size > MAX_JSON) throw new Error("JSON 파일은 20MB 이하만 지원합니다.")
    return [{ path: file.name, data: JSON.parse(await file.text()) }]
  }
  if (!/\.zip$/i.test(file.name)) throw new Error("Instagram에서 받은 ZIP 또는 message JSON 파일을 선택해 주세요.")
  let total = 0
  const buffer = await file.arrayBuffer()
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(new Uint8Array(buffer), {
      filter(entry) {
        // Real exports include both thread/message_1.json and flat inbox/thread.json.
        if (!/(^|\/)messages\/(?:inbox|archived_threads|message_requests)\/.+\.json$/i.test(entry.name)) return false
        total += entry.originalSize
        if (entry.originalSize > MAX_JSON || total > MAX_TOTAL_JSON) throw new Error("압축을 푼 메시지 JSON 크기가 너무 큽니다. 내보내기 기간을 나눠 주세요.")
        return true
      },
    }, (error, entries) => error ? reject(error) : resolve(entries))
  })
  const entries = Object.entries(files)
  if (!entries.length) throw new Error("메시지 JSON을 찾지 못했습니다. Messages를 JSON 형식으로 다시 내보내 주세요.")
  return entries.map(([path, bytes]) => ({ path, data: JSON.parse(strFromU8(bytes)) }))
}
