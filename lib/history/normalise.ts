import { z } from "zod"

const messageSchema = z.object({
  sender_name: z.string(), timestamp_ms: z.number().int().nonnegative(),
  content: z.string().optional(), message_id: z.string().optional(),
}).passthrough()
const exportSchema = z.object({
  participants: z.array(z.object({ name: z.string() })),
  messages: z.array(messageSchema), title: z.string().optional(), thread_path: z.string().optional(),
}).passthrough()

export interface HistoryMessage {
  key: string; threadKey: string; sourcePath: string; sender: string;
  direction: "incoming" | "outgoing" | "unknown"; timestamp: string;
  original: Record<string, unknown>; text: string; displayText: string;
  attachments: { kind: string; reference: unknown }[]; metaMessageId: string | null;
  occurrence: number; participants: string[];
}
// Meta exports may encode UTF-8 bytes as Latin-1. Keep original text separately.
export function decodeMetaText(value: string): string {
  if (![...value].every(c => c.charCodeAt(0) <= 255) || !/[\u0080-\u00ff]/.test(value)) return value
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(value, c => c.charCodeAt(0))) }
  catch { return value }
}
async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)))
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("")
}
export async function normaliseExport(input: unknown, path: string, ownerNames: string[], occurrences?: number[]): Promise<HistoryMessage[]> {
  const data = exportSchema.parse(input)
  if (occurrences && occurrences.length !== data.messages.length) throw new Error("Occurrence count mismatch")
  const participants = data.participants.map(p => p.name)
  // Use the export's thread identity, never a display name as an API ID.
  const threadKey = data.thread_path || path.replace(/\/message_\d+\.json$/i, "")
  const nameKey = (name: string) => decodeMetaText(name).normalize("NFC").trim()
  const owner = new Set(ownerNames.map(nameKey).filter(Boolean))
  const counts = new Map<string, number>()
  const result: HistoryMessage[] = []
  for (const [index, m] of data.messages.entries()) {
    if (!Number.isFinite(new Date(m.timestamp_ms).getTime())) throw new Error("Invalid message date")
    const attachments = ["photos", "videos", "audio_files", "files", "gifs", "sticker", "share"].flatMap(kind => {
      const value = m[kind]
      return value == null ? [] : (Array.isArray(value) ? value : [value]).map(reference => ({ kind, reference }))
    })
    const text = m.content ?? ""
    // Fingerprint includes the full source event: preserve reactions/unsends/system entries.
    const fingerprint = await digest([threadKey, m])
    const occurrence = occurrences?.[index] ?? counts.get(fingerprint) ?? 0
    counts.set(fingerprint, occurrence + 1)
    const key = await digest([fingerprint, occurrence])
    const senderIsOwner = owner.has(nameKey(m.sender_name))
    const knownOwner = participants.some(p => owner.has(nameKey(p)))
    result.push({ key, threadKey, sourcePath: path, sender: m.sender_name,
      direction: senderIsOwner ? "outgoing" : knownOwner ? "incoming" : "unknown",
      timestamp: new Date(m.timestamp_ms).toISOString(), original: m,
      text, displayText: decodeMetaText(text), attachments, metaMessageId: m.message_id ?? null,
      occurrence, participants })
  }
  return result.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.key.localeCompare(b.key))
}
