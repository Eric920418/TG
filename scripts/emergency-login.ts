import { createHmac } from "crypto";
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const telegramId = Number(process.argv[2]);
  if (!Number.isFinite(telegramId) || telegramId <= 0) {
    console.error("用法: pnpm tg:emergency-login <telegram_id>");
    process.exit(1);
  }
  const sessionPassword = process.env.SESSION_PASSWORD;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!sessionPassword || !baseUrl) {
    console.error("缺少 SESSION_PASSWORD 或 NEXT_PUBLIC_BASE_URL");
    process.exit(1);
  }
  const exp = Math.floor(Date.now() / 1000) + 300; // 5 分鐘有效
  const sig = createHmac("sha256", sessionPassword)
    .update(`${telegramId}|${exp}`)
    .digest("hex");
  const raw = `${telegramId}|${exp}|${sig}`;
  const token = Buffer.from(raw, "utf-8").toString("base64url");
  const url = `${baseUrl.replace(/\/$/, "")}/api/auth/emergency?token=${token}`;
  console.log(`\n🔑 緊急登入連結（5 分鐘內有效）:\n\n${url}\n`);
  console.log(`telegram_id=${telegramId}  expires_in=300s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
