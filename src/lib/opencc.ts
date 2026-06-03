import { Converter } from "opencc-js";

// 簡 → 繁 (台灣慣用)，用於檢測「原文是否含簡體字」
const s2t = Converter({ from: "cn", to: "tw" });

/**
 * 白名單：這些字本身就是「合法繁體 / 異體字 / 姓氏 / 一簡對多繁」，
 * OpenCC 仍會把它們轉成另一種寫法，但實務上不該判為簡體（會誤罰正常人）。
 * 例：台(臺)、范/杰(姓氏)、后(皇后)、里(公里)、干(干涉)、着/裏(異體)、强/准/雇(異體)。
 * 注意：真簡體如 为/钟/闲/尽/复 不在此列，仍會被判。
 */
const IGNORE_CHARS = new Set(
  Array.from("台着裏么后里干范丑几余游划占夸咸愿帘强杰准雇"),
);

export type SimplifiedHit = {
  index: number;
  char: string;
  expected: string;
};

/**
 * 逐字檢測簡體：對每個字元單獨做 s2t，若轉換後改變且不在白名單，視為簡體。
 *
 * 逐字（而非整段比對）有兩個好處：
 *  1. 避開 OpenCC 詞組轉換造成的字數錯位（舊版用 index 比對會誤判）。
 *  2. 可精準對每個字套白名單，排除台/范/后/里… 這類合法繁體的誤判。
 */
export function detectSimplified(text: string): SimplifiedHit[] {
  if (!text) return [];
  const hits: SimplifiedHit[] = [];
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (IGNORE_CHARS.has(ch)) continue;
    const conv = s2t(ch);
    if (conv !== ch) {
      hits.push({ index: i, char: ch, expected: conv });
    }
  }
  return hits;
}

export function toTraditional(text: string): string {
  return s2t(text);
}
