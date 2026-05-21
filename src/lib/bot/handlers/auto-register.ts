import { InlineKeyboard, type Bot, type Context } from "grammy";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups } from "@/lib/db/schema";
import { clearGroupCache } from "@/lib/bot/group-cache";
import { log, errorMessage } from "@/lib/log";

const CB_PREFIX = "grp:";

const FULL_MUTE = {
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
  can_invite_users: false,
} as const;

const FULL_OPEN = {
  can_send_messages: true,
  can_send_audios: true,
  can_send_documents: true,
  can_send_photos: true,
  can_send_videos: true,
  can_send_video_notes: true,
  can_send_voice_notes: true,
  can_send_polls: true,
  can_send_other_messages: true,
  can_add_web_page_previews: true,
  can_invite_users: true,
} as const;

export function registerAutoRegisterHandler(bot: Bot) {
  // Telegram 把 basic group 升級為 supergroup 時，會送兩條 service message：
  //   舊群：message.migrate_to_chat_id = <新>
  //   新群：message.migrate_from_chat_id = <舊>
  // 任一條被我們收到都把 DB row 的 chat_id 從舊改新
  bot.on(":migrate_to_chat_id", async (ctx) => {
    const newChatId = ctx.message?.migrate_to_chat_id;
    const oldChatId = ctx.chat?.id;
    if (!newChatId || !oldChatId) return;
    await migrateChatId(oldChatId, newChatId);
  });
  bot.on(":migrate_from_chat_id", async (ctx) => {
    const oldChatId = ctx.message?.migrate_from_chat_id;
    const newChatId = ctx.chat?.id;
    if (!oldChatId || !newChatId) return;
    await migrateChatId(oldChatId, newChatId);
  });

  // bot 加入 / 升降級 / 被踢
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
    const isMember = newStatus === "member";
    const isAdmin = newStatus === "administrator";
    const becameAdmin = oldStatus !== "administrator" && isAdmin;
    const wasIn = oldStatus === "member" || oldStatus === "administrator";
    const isOut = newStatus === "left" || newStatus === "kicked";

    // 加入 or 升為 admin 才走「自動註冊 + 詢問類型」流程
    if (wasOut && (isMember || isAdmin)) {
      await upsertGroup(chat.id, chatTitle(chat));
      await welcome(ctx, chat.id, isAdmin);
    } else if (becameAdmin) {
      // 從非 admin 升為 admin → 補發詢問
      await upsertGroup(chat.id, chatTitle(chat));
      await welcome(ctx, chat.id, true);
    } else if (wasIn && isOut) {
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

  // 按鈕：選擇主群 / 子群
  bot.callbackQuery(
    new RegExp(`^${CB_PREFIX}(main|sub):(-?\\d+)$`),
    async (ctx) => {
      const m = ctx.callbackQuery.data!.match(
        new RegExp(`^${CB_PREFIX}(main|sub):(-?\\d+)$`),
      );
      if (!m) {
        await ctx.answerCallbackQuery({ text: "資料格式錯誤" });
        return;
      }
      const kind = m[1] as "main" | "sub";
      const chatId = Number(m[2]);

      // 只允許點按鈕的人本身是該群 admin
      try {
        const member = await ctx.api.getChatMember(chatId, ctx.from.id);
        if (
          member.status !== "creator" &&
          member.status !== "administrator"
        ) {
          await ctx.answerCallbackQuery({
            text: "只有群組管理員可以設定",
            show_alert: true,
          });
          return;
        }
      } catch (err) {
        await ctx.answerCallbackQuery({
          text: `驗權失敗：${errorMessage(err)}`,
          show_alert: true,
        });
        return;
      }

      if (kind === "main") {
        // 規則：最多 1 個 active main。檢查是否已有別人佔走 main
        const [existingMain] = await db
          .select({ chatId: groups.chatId, title: groups.title })
          .from(groups)
          .where(
            and(
              eq(groups.type, "main"),
              eq(groups.isActive, true),
              ne(groups.chatId, chatId),
            ),
          )
          .limit(1);
        if (existingMain) {
          await ctx.answerCallbackQuery({
            text: `已存在啟用中的主群「${existingMain.title}」。本系統只允許 1 個主群，請先在後台停用舊主群再來。`,
            show_alert: true,
          });
          await log({
            type: "group.set_main_blocked",
            chatId,
            payload: { existingMain: Number(existingMain.chatId) },
          });
          return;
        }

        try {
          await ctx.api.setChatPermissions(chatId, FULL_MUTE);
        } catch (err) {
          await ctx.answerCallbackQuery({
            text: `禁言失敗（bot 需要 Restrict Members 權限）：${errorMessage(err)}`,
            show_alert: true,
          });
          return;
        }

        // 把所有現有 active sub 都收進此 main 的 fan-out 列表
        const subs = await db
          .select({ chatId: groups.chatId, title: groups.title })
          .from(groups)
          .where(
            and(
              eq(groups.type, "sub"),
              eq(groups.isActive, true),
              ne(groups.chatId, chatId),
            ),
          )
          .orderBy(desc(groups.id));

        const subChatIds = subs.map((s) => Number(s.chatId));

        await db
          .update(groups)
          .set({
            type: "main",
            syncTargetChatIds: subChatIds,
            // 保留舊欄位給沒升級的 code path 使用第一個 sub
            syncTargetChatId: subChatIds[0] ?? null,
          })
          .where(eq(groups.chatId, chatId));
        clearGroupCache(chatId);
        for (const id of subChatIds) clearGroupCache(id);

        const paired =
          subs.length > 0
            ? `\n🔗 已自動配對 ${subs.length} 個子群：${subs.map((s) => escapeHtml(s.title)).join("、")}`
            : "\n⚠️ 尚無子群，建立子群後會自動配對。";

        await editIfMsg(
          ctx,
          chatId,
          `🔇 已設為「主群」並禁言全群${paired}\n\n` +
            `現在只有 admin 能在此發言。admin 發的訊息會自動同步到所有子群。`,
        );
        await ctx.answerCallbackQuery({ text: "✅ 已設為主群" });
        await log({
          type: "group.set_main",
          chatId,
          payload: { pairedSubs: subChatIds },
        });
      } else {
        // sub
        try {
          await ctx.api.setChatPermissions(chatId, FULL_OPEN);
        } catch {
          // 不阻擋，子群預設開放但即便 API 失敗也接受
        }

        await db
          .update(groups)
          .set({
            type: "sub",
            syncTargetChatId: null,
            syncTargetChatIds: [],
          })
          .where(eq(groups.chatId, chatId));

        // 找唯一 active main 並把此 sub 的 chat_id APPEND 進它的 syncTargetChatIds
        const [main] = await db
          .select()
          .from(groups)
          .where(
            and(
              eq(groups.type, "main"),
              eq(groups.isActive, true),
              ne(groups.chatId, chatId),
            ),
          )
          .limit(1);

        if (main) {
          const existing = main.syncTargetChatIds ?? [];
          const merged = existing.includes(chatId)
            ? existing
            : [...existing, chatId];
          await db
            .update(groups)
            .set({
              syncTargetChatIds: merged,
              // 同步維護舊單一欄位（第一個 sub 當代表，供舊 code 用）
              syncTargetChatId: merged[0] ?? null,
            })
            .where(eq(groups.chatId, Number(main.chatId)));
          clearGroupCache(Number(main.chatId));
        }
        clearGroupCache(chatId);

        const paired = main
          ? `\n🔗 已自動加入主群「<b>${escapeHtml(main.title)}</b>」的同步目標清單`
          : "\n⚠️ 尚無主群，建立主群後會自動配對。";

        await editIfMsg(
          ctx,
          chatId,
          `💬 已設為「子群」${paired}\n\n` +
            `此群可自由聊天。主群 admin 發的訊息會自動同步到這裡。`,
        );
        await ctx.answerCallbackQuery({ text: "✅ 已設為子群" });
        await log({
          type: "group.set_sub",
          chatId,
          payload: { pairedWithMain: main ? Number(main.chatId) : null },
        });
      }
    },
  );
}

async function migrateChatId(oldId: number, newId: number): Promise<void> {
  try {
    const [oldRow] = await db
      .select()
      .from(groups)
      .where(eq(groups.chatId, oldId))
      .limit(1);
    if (!oldRow) {
      // 舊 row 不存在就不用做；新 row 若不存在 my_chat_member 也會處理
      return;
    }
    const [newRow] = await db
      .select()
      .from(groups)
      .where(eq(groups.chatId, newId))
      .limit(1);

    if (newRow) {
      // 兩個 row 都存在：把舊 row 的設定 merge 進新 row（保留使用者選的 type）
      const preferOldType = oldRow.type === "main" && newRow.type === "sub";
      await db
        .update(groups)
        .set({
          type: preferOldType ? "main" : newRow.type,
          isActive: true,
          syncTargetChatId: oldRow.syncTargetChatId ?? newRow.syncTargetChatId,
          simplifiedPolicy: oldRow.simplifiedPolicy,
          raidThreshold: oldRow.raidThreshold,
          raidWindowSec: oldRow.raidWindowSec,
          warningLimit: oldRow.warningLimit,
          muteDurationSec: oldRow.muteDurationSec,
          verifyTimeoutSec: oldRow.verifyTimeoutSec,
        })
        .where(eq(groups.id, newRow.id));
      // 把指向舊 chat_id 的 sync_target 都改指新 chat_id
      await db
        .update(groups)
        .set({ syncTargetChatId: newId })
        .where(eq(groups.syncTargetChatId, oldId));
      // 移除舊 row
      await db.delete(groups).where(eq(groups.id, oldRow.id));
    } else {
      // 只有舊 row：直接把 chat_id 改成新的
      await db
        .update(groups)
        .set({ chatId: newId })
        .where(eq(groups.id, oldRow.id));
      // 其他 row 的 sync_target 指向舊的也一併更新
      await db
        .update(groups)
        .set({ syncTargetChatId: newId })
        .where(eq(groups.syncTargetChatId, oldId));
    }

    clearGroupCache(oldId);
    clearGroupCache(newId);
    await log({
      type: "group.migrated",
      chatId: newId,
      payload: { from: oldId, to: newId },
    });
  } catch (err) {
    await log({
      type: "group.migrate_failed",
      chatId: newId,
      error: errorMessage(err),
      payload: { from: oldId },
    });
  }
}

async function upsertGroup(chatId: number, title: string): Promise<void> {
  try {
    await db
      .insert(groups)
      .values({ chatId, title, type: "sub", isActive: true })
      .onConflictDoUpdate({
        target: groups.chatId,
        set: { title, isActive: true },
      });
    clearGroupCache(chatId);
  } catch (err) {
    await log({
      type: "group.upsert_failed",
      chatId,
      error: errorMessage(err),
    });
  }
}

async function welcome(
  ctx: Context,
  chatId: number,
  isAdmin: boolean,
): Promise<void> {
  try {
    if (!isAdmin) {
      await ctx.api.sendMessage(
        chatId,
        `✅ 已偵測到本群（chat_id: <code>${chatId}</code>）\n\n` +
          `⚠️ 請先把我升為「管理員」(admin)，並開啟這些權限：\n` +
          `• Delete Messages\n` +
          `• Restrict Members\n` +
          `• Ban Users\n\n` +
          `升級後我會自動詢問你這群是主群還是子群。`,
        { parse_mode: "HTML" },
      );
    } else {
      const kb = new InlineKeyboard()
        .text("🔇 主群（廣播禁言）", `${CB_PREFIX}main:${chatId}`)
        .row()
        .text("💬 子群（自由聊天）", `${CB_PREFIX}sub:${chatId}`);
      await ctx.api.sendMessage(
        chatId,
        `✅ Bot 已就緒。請選擇此群類型：\n\n` +
          `• <b>主群</b>：只有 admin 能發言；admin 訊息自動同步到子群\n` +
          `• <b>子群</b>：自由聊天；接收主群同步來的廣告\n\n` +
          `chat_id: <code>${chatId}</code>`,
        { reply_markup: kb, parse_mode: "HTML" },
      );
    }
    await log({
      type: "group.welcome_sent",
      chatId,
      payload: { isAdmin },
    });
  } catch (err) {
    await log({
      type: "group.welcome_failed",
      chatId,
      error: errorMessage(err),
    });
  }
}

async function editIfMsg(
  ctx: Context,
  chatId: number,
  text: string,
): Promise<void> {
  const msg = ctx.callbackQuery?.message;
  if (!msg) return;
  try {
    await ctx.api.editMessageText(chatId, msg.message_id, text, {
      parse_mode: "HTML",
    });
  } catch {
    // 訊息可能太舊或被刪
  }
}

function chatTitle(chat: { id: number; type: string } & { title?: string }): string {
  return "title" in chat && chat.title ? chat.title : `chat_${chat.id}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
