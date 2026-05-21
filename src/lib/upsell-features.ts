import {
  Bot,
  Languages,
  Gift,
  FileText,
  BarChart3,
  Tag,
  Users,
  MousePointerClick,
  type LucideIcon,
} from "lucide-react";

export type UpsellFeature = {
  id: string;
  icon: LucideIcon;
  title: string;
  tagline: string;
  bullets: string[];
  category: "marketing" | "analytics" | "collab";
};

export const upsellFeatures: UpsellFeature[] = [
  {
    id: "ai-cs",
    icon: Bot,
    title: "AI 自動客服",
    tagline: "群成員 @bot 提問，GPT 自動以你的 FAQ 知識庫回答，24/7 不漏訊息。",
    bullets: [
      "接 OpenAI / Claude API 多模型可選",
      "自訂客服角色（語氣、知識領域、禁區）",
      "對話歷史可匯出檢視",
    ],
    category: "marketing",
  },
  {
    id: "translate",
    icon: Languages,
    title: "多語言自動翻譯",
    tagline: "Admin 中文發訊息，子群依設定自動翻成英 / 日 / 韓 / 越 / 泰。",
    bullets: [
      "每個子群獨立指定目標語言",
      "原文 + 譯文並列，保留 admin 原意",
      "支援按鈕文字一起翻譯",
    ],
    category: "marketing",
  },
  {
    id: "lottery",
    icon: Gift,
    title: "抽獎機器人",
    tagline: "定時開放抽獎、用戶點按鈕參加、bot 自動抽中並 DM 中獎者。",
    bullets: [
      "後台設定獎品、人數、開放時間",
      "支援多輪、設定資格（如：加群滿 X 天）",
      "中獎名單自動公告 + DM 通知",
    ],
    category: "marketing",
  },
  {
    id: "full-logs",
    icon: FileText,
    title: "完整活動記錄 + 篩選",
    tagline: "重啟完整 audit log 頁，可依日期 / 類型 / 用戶 / 群組篩選並匯出。",
    bullets: [
      "全文搜尋 + 多欄位篩選",
      "CSV / JSON 匯出供外部分析",
      "保留週期可自訂（30 / 90 / 365 天）",
    ],
    category: "analytics",
  },
  {
    id: "charts",
    icon: BarChart3,
    title: "進階統計圖表",
    tagline: "Dashboard 加入折線圖、留存率、廣告轉換漏斗等視覺化指標。",
    bullets: [
      "每日訊息量 / 新增成員 / 違規趨勢圖",
      "廣告點擊率（按鈕 click-through）",
      "留存：7 日 / 30 日活躍率",
    ],
    category: "analytics",
  },
  {
    id: "crm",
    icon: Tag,
    title: "用戶 CRM / 標籤系統",
    tagline: "給群成員打標籤、分眾儲存、針對特定族群精準推送廣告。",
    bullets: [
      "自訂標籤（VIP / 新人 / 沉睡用戶…）",
      "依標籤篩選後發排程貼文",
      "用戶資料可匯出做外部行銷",
    ],
    category: "analytics",
  },
  {
    id: "multi-admin",
    icon: Users,
    title: "多管理員協作",
    tagline: "重啟管理員 CRUD，多人同時管理後台、權限分隔到各功能。",
    bullets: [
      "owner / editor / viewer 三階權限",
      "操作日誌可追蹤是誰改了什麼",
      "不再共用一個帳號管理",
    ],
    category: "collab",
  },
  {
    id: "interactive",
    icon: MousePointerClick,
    title: "互動按鈕（報名/投票/白名單）",
    tagline: "Callback 按鈕觸發 bot DM 收集表單資料，自動匯整成名單。",
    bullets: [
      "報名活動：點按鈕 → bot DM 表單 → 收回資料",
      "群內投票：即時計票、結果公告",
      "白名單登記：自動驗證 + 收 telegram_id 名單",
    ],
    category: "collab",
  },
];
