// @ts-nocheck -- OpenNext's generated worker and runtime types exist after build.
import openNext from "../.open-next/worker.js"
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "../.open-next/worker.js"
import { runBackfillStep } from "./backfill"
import { handlePurchaseWebhook } from "./purchases"
import { handleIntelligence, handleTrackedClick } from "./intelligence-api"
import { runOneAnalysis } from "./intelligence"
import { handleHistoryImport } from "./history-handler"
export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(Math.floor(event.scheduledTime / 300000) % 2 === 0 ? runBackfillStep(env) : runOneAnalysis(env)); },
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname
    if (path === "/api/intelligence/purchase") return handlePurchaseWebhook(request, env)
    if (path.startsWith("/r/")) return handleTrackedClick(request, env)
    if (path === "/api/intelligence" || path === "/api/history/config") return handleIntelligence(request, env)
    if (path === "/api/history/import" && request.headers.has("authorization")) return handleHistoryImport(request, env)
    return openNext.fetch(request, env, ctx)
  },
}
