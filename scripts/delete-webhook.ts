import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("缺少 TELEGRAM_BOT_TOKEN");
    process.exit(1);
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
    method: "POST",
  });
  const data = await res.json();
  console.log(data);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
