import { createHmac } from "crypto";
import type { Bot } from "grammy";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { admins } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import { log, errorMessage } from "@/lib/log";

const RATE_LIMIT = 5; // 每分鐘最多 5 次
const RATE_WINDOW_SEC = 60;

export function registerLoginHandler(bot: Bot) {
  bot.command(["login", "start"], async (ctx) => {
    if (!ctx.from) return;
    if (ctx.chat?.type !== "private") {
      await ctx.reply("請私訊 bot 使用 /login 取得登入連結").catch(() => {});
      return;
    }

    // Rate limit per telegram_id
    try {
      const key = `login:rl:${ctx.from.id}`;
      const count = await redis().incr(key);
      if (count === 1) {
        await redis().expire(key, RATE_WINDOW_SEC);
      }
      if (count > RATE_LIMIT) {
        await ctx
          .reply(`⏳ 太頻繁了，請 ${RATE_WINDOW_SEC} 秒後再試。`)
          .catch(() => {});
        await log({
          type: "login.rate_limited",
          userId: ctx.from.id,
          payload: { count },
        });
        return;
      }
    } catch (err) {
      // Redis 故障不應阻擋登入，記錄後繼續
      await log({
        type: "login.rate_limit_check_failed",
        userId: ctx.from.id,
        error: errorMessage(err),
      });
    }

    try {
      const [admin] = await db
        .select()
        .from(admins)
        .where(eq(admins.telegramId, ctx.from.id))
        .limit(1);

      if (!admin) {
        await ctx.reply(
          `⛔ Telegram ID ${ctx.from.id} 不在管理員名單。\n` +
            `請聯絡 owner 把你的 ID 加入 admins 表。`,
        );
        return;
      }
      if (!admin.isActive) {
        await ctx.reply("⛔ 你的管理員帳號已停用。");
        return;
      }

      // 順便把 first_name / username / photo_url 更新到 DB
      await db
        .update(admins)
        .set({
          firstName: ctx.from.first_name ?? admin.firstName,
          username: ctx.from.username ?? admin.username,
        })
        .where(eq(admins.id, admin.id));

      const e = env();
      const exp = Math.floor(Date.now() / 1000) + 300;
      const sig = createHmac("sha256", e.SESSION_PASSWORD)
        .update(`${admin.telegramId}|${exp}`)
        .digest("hex");
      const raw = `${admin.telegramId}|${exp}|${sig}`;
      const token = Buffer.from(raw, "utf-8").toString("base64url");
      const url = `${e.NEXT_PUBLIC_BASE_URL}/api/auth/emergency?token=${token}`;

      await ctx.reply(
        `🔑 後台登入連結（5 分鐘內有效）\n\n${url}\n\n` +
          `直接點擊或複製到瀏覽器網址列即可登入。`,
        { link_preview_options: { is_disabled: true } },
      );

      await log({
        type: "login.dm_issued",
        userId: ctx.from.id,
        payload: { adminId: admin.id, role: admin.role },
      });
    } catch (err) {
      const msg = errorMessage(err);
      await ctx
        .reply(`產生登入連結失敗：${msg}`)
        .catch(() => {});
      await log({
        type: "login.dm_failed",
        userId: ctx.from.id,
        error: msg,
      });
    }
  });
}
