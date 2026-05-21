import { Converter } from "opencc-js";

// 簡 → 繁 (台灣慣用)，用於檢測「原文是否含簡體字」
const s2t = Converter({ from: "cn", to: "tw" });

export type SimplifiedHit = {
  index: number;
  char: string;
  expected: string;
};

/**
 * 嚴格策略：把整段文字做 s2t 轉換，若某個位置的字元在轉換後變了，
 * 則該字一定是「明確的簡體形」。繁簡同形字（人/山/水…）轉換結果不變，
 * 自動避開誤判。
 */
export function detectSimplified(text: string): SimplifiedHit[] {
  if (!text) return [];
  const converted = s2t(text);
  if (converted === text) return [];

  const hits: SimplifiedHit[] = [];
  const orig = Array.from(text);
  const conv = Array.from(converted);
  const len = Math.min(orig.length, conv.length);
  for (let i = 0; i < len; i++) {
    if (orig[i] !== conv[i]) {
      hits.push({ index: i, char: orig[i], expected: conv[i] });
    }
  }
  return hits;
}

export function toTraditional(text: string): string {
  return s2t(text);
}
