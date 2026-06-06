import type { Api, Context } from "grammy";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { warnings, type Group } from "@/lib/db/schema";
import { log, errorMessage } from "@/lib/log";

/** 解禁時恢復的權限（全開） */
const UNMUTE_PERMS = {
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
} as const;

/**
 * 解除某人的禁言：恢復發言權限 + 清掉他的警告計數
 * （否則他一發言又馬上累積到上限被再次禁言）。
 */
export async function unmuteUser(
  api: Api,
  chatId: number,
  userId: number,
): Promise<void> {
  await api.restrictChatMember(chatId, userId, UNMUTE_PERMS);
  await db
    .delete(warnings)
    .where(and(eq(warnings.chatId, chatId), eq(warnings.userId, userId)));
}

/** 達警告上限後套用的禁言權限（全關） */
const MUTE_PERMS = {
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
} as const;

type PunishArgs = {
  chatId: number;
  userId: number;
  username: string | null;
  /** 寫進 warnings.reason，例如 "simplified_chinese" / "link" */
  reason: string;
  group: Group;
  /** 未達上限時的警告訊息（HTML），收到目前累計資訊 */
  buildWarn: (info: WarnInfo) => string;
  /** 達上限被禁言時的訊息（HTML） */
  buildMute: (info: WarnInfo) => string;
};

export type WarnInfo = {
  mention: string;
  count: number;
  limit: number;
  muteHours: number;
};

/**
 * 共用的「累加警告 → 達上限禁言」處置。simplified / link-guard 共用。
 * 注意：warnings 計數是 per-(chatId,userId) 跨 reason 共用，與既有 keyword warn 行為一致。
 * @returns { count, muted } 本次累計次數與是否觸發禁言
 */
export async function warnAndMaybeMute(
  ctx: Context,
  args: PunishArgs,
): Promise<{ count: number; muted: boolean }> {
  const { chatId, userId, username, reason, group } = args;

  const [row] = await db
    .insert(warnings)
    .values({ chatId, userId, username, reason, count: 1 })
    .onConflictDoUpdate({
      target: [warnings.chatId, warnings.userId],
      set: {
        count: sql`${warnings.count} + 1`,
        lastAt: new Date(),
        username,
        reason,
      },
    })
    .returning();

  const mention =
    username != null
      ? `@${username}`
      : `<a href="tg://user?id=${userId}">user</a>`;
  const info: WarnInfo = {
    mention,
    count: row.count,
    limit: group.warningLimit,
    muteHours: Math.round(group.muteDurationSec / 3600),
  };

  const reachedLimit = row.count >= group.warningLimit;

  if (reachedLimit) {
    const muteUntil = Math.floor(Date.now() / 1000) + group.muteDurationSec;
    try {
      await ctx.api.restrictChatMember(chatId, userId, MUTE_PERMS, {
        until_date: muteUntil,
      });
    } catch (err) {
      await log({
        type: "punish.mute_failed",
        chatId,
        userId,
        error: errorMessage(err),
        payload: { reason },
      });
    }

    // 禁言通知帶「解除禁言」按鈕：違規者的訊息都被刪了，管理員常常沒東西可回覆，
    // 點這顆按鈕（僅 admin 有效）是最可靠的解禁入口
    await ctx.api
      .sendMessage(chatId, args.buildMute(info), {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔓 解除禁言（管理員）", callback_data: `unmute:${userId}` }],
          ],
        },
      })
      .catch(() => {});

    // 禁言後清除警告計數，下次違規重新累積
    await db
      .delete(warnings)
      .where(and(eq(warnings.chatId, chatId), eq(warnings.userId, userId)));
  } else {
    await ctx.api
      .sendMessage(chatId, args.buildWarn(info), { parse_mode: "HTML" })
      .catch(() => {});
  }

  return { count: row.count, muted: reachedLimit };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
