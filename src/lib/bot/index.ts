import { Bot } from "grammy";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { env } from "@/lib/env";
import { registerVerifyHandlers } from "./handlers/verify";
import { registerSimplifiedHandler } from "./handlers/simplified";
import { registerLinkGuardHandler } from "./handlers/link-guard";
import { registerKeywordHandler } from "./handlers/keyword";
import { registerRaidHandler } from "./handlers/raid";
import { registerAdToggleHandler } from "./handlers/ad-toggle";
import { registerButtonAttachHandler } from "./handlers/button-attach";
import { registerLeaveMonitor } from "./handlers/leave-monitor";
import { registerLoginHandler } from "./handlers/login";
import { registerAutoRegisterHandler } from "./handlers/auto-register";
import { registerStagingHandler } from "./handlers/staging";
import { log, errorMessage } from "@/lib/log";

let cached: Bot | null = null;
let initialized = false;

export async function getBot(): Promise<Bot> {
  if (cached && initialized) return cached;
  if (!cached) {
    cached = new Bot(env().TELEGRAM_BOT_TOKEN);

    // Rate limit transformer：自動處理 Telegram 限制 (30 msg/s, 20/min/group)
    cached.api.config.use(apiThrottler());

    // 全域錯誤：log 但不要 throw，否則 webhook 回 5xx 會被 Telegram 重試
    cached.catch(async (err) => {
      await log({
        type: "bot.error",
        chatId: err.ctx?.chat?.id,
        userId: err.ctx?.from?.id,
        error: errorMessage(err.error),
        payload: {
          update_id: err.ctx?.update?.update_id,
        },
      });
      console.error("[bot.catch]", err);
    });

    // Handler 順序很重要：login DM → auto-register → staging DM → 認證 → raid → 簡繁 → 禁連結 → 關鍵字 → 按鈕附加（最後）
    registerLoginHandler(cached);
    registerAutoRegisterHandler(cached);
    registerStagingHandler(cached);
    registerVerifyHandlers(cached);
    registerRaidHandler(cached);
    registerLeaveMonitor(cached);
    registerSimplifiedHandler(cached);
    registerLinkGuardHandler(cached);
    registerKeywordHandler(cached);
    registerAdToggleHandler(cached);
    registerButtonAttachHandler(cached);
  }
  if (!initialized) {
    await cached.init();
    initialized = true;
  }
  return cached;
}
