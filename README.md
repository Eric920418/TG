# TG Bot — Telegram 雙群管理機器人 + Vercel 後台

從零打造的 Telegram 群組守門 / 廣告同步 / 排程貼文機器人，部署在 Vercel Pro。

## 功能

- **雙群同步**：主群（admin-only）發訊息自動 `copyMessage` 到所有同步目標子群（1 主群 → N 子群 fan-out）。系統強制最多 1 個 active main，N 個 sub。
- **入群認證**：新成員自動禁言 → 隨機題庫選擇題 → 答對解禁 / 答錯或超時踢出。
- **簡體字守門**：用 OpenCC 嚴格策略撤回簡體訊息並警告，達上限自動禁言（避開繁簡同形字誤判）。
- **關鍵字 / 連結 / @ 提及黑名單**：可指定 `delete` / `warn` / `ban` 三種動作，全域或單群套用。
- **防 raid**：短時間大量加入自動觸發全群禁言並通知 admin。
- **退群雪崩監控**：短時間大量退群通知 admin。
- **排程貼文**：後台建立排程 → QStash 在指定時間精準觸發 + Vercel Cron 兜底補發；支援文字、單張媒體、多行 inline 按鈕（URL + Copy Text）。
- **群組預設按鈕**：主群可設定預設按鈕，**主群→子群同步時自動附加**（實現「聊天室按鈕」零手動化）。
- **後台**：Telegram bot DM `/login` 取得連結登入；題庫 / 群組 / 關鍵字 / 排程 / 管理員 / 活動記錄完整 CRUD。
- **升級套餐廣告位**：後台 `/upgrade` 頁與 Dashboard 底部展示 8 個進階加購功能（AI 客服、多語翻譯、抽獎、CRM 等），純 UI 展示，需聯絡開發者個別開通。
- **錯誤可視化**：所有錯誤完整顯示在前端（依使用者規約）。

## 技術選型

- Next.js 16 (App Router, Turbopack) + React 19 + Tailwind v4
- grammY 1.x（Telegram bot SDK，serverless-first）+ `@grammyjs/transformer-throttler` 處理 rate limit
- Neon Postgres + Drizzle ORM（`strict: true`，不允許破壞性遷移）
- Upstash Redis（raid 計數 / cache）
- Upstash QStash（任意時間點觸發 webhook，補 Vercel Cron 最小分鐘級限制以外）
- iron-session（cookie session）
- OpenCC-JS（繁簡轉換檢測）
- 套件管理一律 **pnpm**

## 目錄

```
src/
├── app/
│   ├── (admin)/           後台路由群組
│   │   ├── login/         Telegram Login Widget 頁
│   │   ├── posts/         排程貼文 CRUD
│   │   ├── questions/     認證題庫 CRUD
│   │   ├── groups/        群組設定 CRUD
│   │   ├── keywords/      關鍵字黑名單 CRUD
│   │   ├── admins/        管理員 CRUD（owner 限定）
│   │   ├── logs/          活動記錄
│   │   └── page.tsx       Dashboard
│   └── api/
│       ├── telegram/webhook/    Telegram update 接收
│       ├── auth/telegram/       Login Widget 驗章
│       ├── auth/logout/
│       ├── cron/send-scheduled/ QStash 排程觸發
│       ├── cron/sweep/          Vercel Cron 補發
│       └── cron/verification-expire/ 過期驗證踢人
├── lib/
│   ├── db/                Drizzle schema + client
│   ├── bot/               grammY bot + handlers
│   │   └── handlers/      verify / simplified / keyword / raid / leave-monitor / broadcast
│   ├── auth/              telegram hash 驗 + session
│   ├── actions/           server actions（CRUD + posts）
│   ├── env.ts             zod 環境變數驗證
│   ├── opencc.ts          嚴格簡繁檢測
│   ├── post-sender.ts     發送貼文到多群
│   ├── qstash.ts / redis.ts / log.ts
├── components/ui/         shadcn 風格元件
└── proxy.ts               Next.js 16 proxy（前身 middleware）

drizzle/                   migration 產出
scripts/                   set-webhook / delete-webhook CLI
vercel.json                Vercel Cron 設定
```

## 部署步驟

### 1. 取得各服務的認證

| 服務 | 取得方式 |
|---|---|
| Telegram Bot Token | 找 [@BotFather](https://t.me/BotFather) 建立 bot，記下 token；用 `/setdomain` 設你的 Vercel 網域以啟用 Login Widget |
| Neon Postgres | https://neon.tech 建專案，複製 connection string |
| Upstash Redis | https://upstash.com 建 Redis DB，複製 REST URL + Token |
| Upstash QStash | 同 Upstash 後台 → QStash → 取 Token、Current Signing Key、Next Signing Key |

### 2. 設定環境變數

複製 `.env.local.example` 為 `.env.local`，填入所有變數：

```bash
cp .env.local.example .env.local

# 產生需要的隨機密鑰
echo "TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)"
echo "SESSION_PASSWORD=$(openssl rand -base64 48 | tr -d '\n')"
echo "CRON_SECRET=$(openssl rand -hex 16)"
```

### 3. 安裝 + 建立資料表

```bash
pnpm install
pnpm db:generate   # 產生 migration（首次）
pnpm db:migrate    # 套用到 Neon
```

> ⚠️ Drizzle 設定為 `strict: true`，破壞性遷移會被拒絕（不允許 `accept-data-loss`）。

### 4. 本機 dev + ngrok（測試 webhook）

```bash
pnpm dev
# 另開 terminal
ngrok http 3000
# 把 NEXT_PUBLIC_BASE_URL 改成 ngrok 給的 https URL
pnpm tg:set-webhook
```

### 5. 部署到 Vercel

```bash
# 已綁定 CLI
vercel link              # 首次：連結到 Vercel 專案
vercel env add ...       # 一個個加入，或在 Vercel dashboard 設
vercel --prod
```

部署成功後：

```bash
# 把 NEXT_PUBLIC_BASE_URL 改成 https://你的網域.vercel.app
pnpm tg:set-webhook
```

### 6. 設定首位 owner

由於後台只允許資料庫中存在的 admin 登入，必須先手動插一筆 owner：

```sql
INSERT INTO admins (telegram_id, role, is_active)
VALUES (<你的 telegram_id>, 'owner', true);
```

`telegram_id` 可以丟訊息給 [@userinfobot](https://t.me/userinfobot) 取得。

### 7. 把 bot 加入兩個群組

1. 在 Telegram 建兩個群（主群 + 子群），都把 bot 升為 admin。
2. Bot 至少需要這些權限：
   - Delete Messages（撤回違規）
   - Restrict Members（禁言）
   - Ban Users（踢人）
   - Pin Messages（選擇性）
3. 在「群組設定」頁面新增兩個群組：
   - **主群**：`type=main`、`sync_target_chat_id` 填子群 chat_id
   - **子群**：`type=sub`、`sync_target_chat_id` 留空
4. 在「認證題庫」加入至少 1 題。
5. 開始測試。

## 開發指令

```bash
pnpm dev               # 本機 dev
pnpm build             # 產生 production build
pnpm db:generate       # 產 Drizzle migration
pnpm db:migrate        # 套用 migration
pnpm db:studio         # Drizzle Studio
pnpm tg:set-webhook    # 設 Telegram webhook
pnpm tg:delete-webhook # 移除 webhook（切換 polling 開發用）
```

## Vercel Cron

`vercel.json` 已註冊兩條：

| Path | Schedule | 用途 |
|---|---|---|
| `/api/cron/sweep` | `*/5 * * * *` | 補發 `status='pending' AND send_at < now()` 的排程 |
| `/api/cron/verification-expire` | `* * * * *` | 踢出超時未答題的待驗證用戶 |

Cron 端點用 `Authorization: Bearer <CRON_SECRET>` 驗章。Vercel 會自動帶入。

## 簡繁檢測策略

`src/lib/opencc.ts` 用 `Converter({ from: "cn", to: "tw" })` 把整段訊息 s2t 轉換，逐字元比對；只有「轉換後變不同」的字才算簡體命中。這樣繁簡同形字（人、山、水…）自動跳過，不會誤判。

## QStash + Cron 雙保險

排程流程：
1. 後台建立 → `scheduled_posts` 寫入 `status='pending'`。
2. 同時呼叫 `qstash.publishJSON({ notBefore })` 預定時間觸發 `/api/cron/send-scheduled?id=X`。
3. 端點驗 `upstash-signature` → 發送 → 標記 `sent` / `failed`。
4. 萬一 QStash 掉訊息，Vercel Cron 每 5 分鐘掃 `status='pending' AND send_at < now()` 補發。

## 安全機制

| 端點 | 保護 |
|---|---|
| `/api/telegram/webhook` | `X-Telegram-Bot-Api-Secret-Token` header 驗 |
| `/api/auth/telegram` | HMAC-SHA256 驗 Telegram Login Widget hash |
| `/api/cron/send-scheduled` | QStash 簽章 **或** `CRON_SECRET` |
| `/api/cron/sweep` & `/api/cron/verification-expire` | `Authorization: Bearer <CRON_SECRET>` |
| Server actions | `requireAdmin` / `requireOwner`（session-based） |

## 設計取捨

- **為什麼用 grammY 不用 Telegraf**：grammY 對 serverless 友善（`webhookCallback(bot, "std/http")` 原生支援 Web Request），不像 Telegraf 預設 long polling。
- **為什麼 QStash + Vercel Cron 雙保險**：Vercel Cron 最小單位是「每分鐘」，且只支援 cron expression 不能任意時間；QStash 反之，但偶爾掉訊息。兩者互補。
- **為什麼用 `copyMessage` 不用 `forwardMessage` 做主群→子群同步**：`copyMessage` 不帶「forwarded from」標記，看起來像 bot 原生發的，較像「自家廣告」。
- **為什麼 bot init() 只跑一次**：grammY 的 `init()` 會呼叫 `getMe`，每個 cold start 都跑會浪費 latency。用 module-level cache。

## 風險與限制

- Vercel function timeout：Pro 60s。一次發送 > 30 個群會接近上限，需要拆 QStash 批次（目前未實作，但 sweep 兜底會接住）。
- Telegram rate limit：grammY throttler 自動處理（30 msg/s 全域、20 msg/min/group）。
- QStash 免費額度：500 messages/day。Pro 後升級。
- Login Widget 需要 bot 已用 `/setdomain` 設定網域，否則登入會直接報錯。

## 授權

私人使用，未開源。
