import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!token || !secret || !baseUrl) {
    console.error("缺少 TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET / NEXT_PUBLIC_BASE_URL");
    process.exit(1);
  }
  const url = `${baseUrl.replace(/\/$/, "")}/api/telegram/webhook`;
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret,
      allowed_updates: [
        "message",
        "edited_message",
        "channel_post",
        "edited_channel_post",
        "callback_query",
        "chat_member",
        "my_chat_member",
      ],
      drop_pending_updates: false,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    console.error("setWebhook failed:", data);
    process.exit(1);
  }
  console.log(`✅ Webhook 已設定 → ${url}`);
  console.log("  allowed_updates: message, edited_message, channel_post, edited_channel_post, callback_query, chat_member, my_chat_member");
  console.log("  注意: chat_member 需要 bot 是群組 admin 才會收到");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
