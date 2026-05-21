import type { Bot } from "grammy";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups } from "@/lib/db/schema";
import { clearGroupCache } from "@/lib/bot/group-cache";
import { log, errorMessage } from "@/lib/log";

export function registerAutoRegisterHandler(bot: Bot) {
  bot.on("my_chat_member", async (ctx) => {
    const upd = ctx.myChatMember;
    if (!upd) return;

    const chat = ctx.chat;
    if (
      chat.type !== "group" &&
      chat.type !== "supergroup" &&
      chat.type !== "channel"
    ) {
      return;
    }

    const oldStatus = upd.old_chat_member.status;
    const newStatus = upd.new_chat_member.status;

    const wasOut = oldStatus === "left" || oldStatus === "kicked";
    const isIn = newStatus === "member" || newStatus === "administrator";
    const wasIn =
      oldStatus === "member" || oldStatus === "administrator";
    const isOut = newStatus === "left" || newStatus === "kicked";

    // bot 加入 / 從非成員 → 成員
    if (wasOut && isIn) {
      const title = "title" in chat ? chat.title : `chat_${chat.id}`;
      try {
        await db
          .insert(groups)
          .values({
            chatId: chat.id,
            title,
            type: "sub",
            isActive: true,
          })
          .onConflictDoUpdate({
            target: groups.chatId,
            set: { title, isActive: true },
          });

        clearGroupCache(chat.id);

        await ctx.api
          .sendMessage(
            chat.id,
            `✅ 已自動註冊到管理後台\n\n` +
              `chat_id: <code>${chat.id}</code>\n` +
              `預設類型: <b>sub</b> (子群，可聊天)\n\n` +
              `請到後台「群組設定」調整：\n` +
              `• 若這是主群（admin-only 廣播）→ 改 type=main\n` +
              `• 若這是子群（同步收主群訊息）→ 留 sub，但需在主群設定 sync_target_chat_id\n\n` +
              `Bot 還需要管理員權限：Delete Messages / Restrict Members / Ban Users`,
            { parse_mode: "HTML" },
          )
          .catch(() => {});

        await log({
          type: "group.auto_registered",
          chatId: chat.id,
          payload: { title, status: newStatus, chatType: chat.type },
        });
      } catch (err) {
        await log({
          type: "group.auto_register_failed",
          chatId: chat.id,
          error: errorMessage(err),
        });
      }
    }

    // bot 被踢 / 退出 → 標記停用（不刪資料，保留歷史與設定）
    if (wasIn && isOut) {
      try {
        await db
          .update(groups)
          .set({ isActive: false })
          .where(eq(groups.chatId, chat.id));
        clearGroupCache(chat.id);
        await log({ type: "group.bot_removed", chatId: chat.id });
      } catch (err) {
        await log({
          type: "group.bot_remove_failed",
          chatId: chat.id,
          error: errorMessage(err),
        });
      }
    }
  });
}
