/**
 * 連結偵測的單一真相來源。
 * 「連結」= http/https 網址 或 t.me 邀請連結。
 * 不含 @用戶名——群友互相標記（tag）是正常社交行為，不該被當連結擋。
 * 若要擋 @提及，用 keyword 黑名單的 "mention" 類型（containsMention）。
 * 同時被 link-guard handler 與 keyword 黑名單的 "link" 類型共用。
 */
const LINK_RE = /(https?:\/\/|t\.me\/)/i;
const MENTION_RE = /@[a-zA-Z0-9_]{3,}/;

export function containsLink(text: string): boolean {
  return LINK_RE.test(text);
}

export function containsMention(text: string): boolean {
  return MENTION_RE.test(text);
}
