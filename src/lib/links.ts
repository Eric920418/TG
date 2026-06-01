/**
 * 連結偵測的單一真相來源。
 * 「連結」= http/https 網址、t.me 邀請、或 @用戶名（3 字以上）。
 * 同時被 link-guard handler 與 keyword 黑名單的 "link" 類型共用。
 */
const LINK_RE = /(https?:\/\/|t\.me\/|@[a-zA-Z0-9_]{3,})/i;
const MENTION_RE = /@[a-zA-Z0-9_]{3,}/;

export function containsLink(text: string): boolean {
  return LINK_RE.test(text);
}

export function containsMention(text: string): boolean {
  return MENTION_RE.test(text);
}
