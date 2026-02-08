// Run with: npx tsx scripts/setup-webhook.ts
// Requires TELEGRAM_BOT_TOKEN and WORKER_URL environment variables

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WORKER_URL = process.env.WORKER_URL;

if (!TELEGRAM_BOT_TOKEN || !WORKER_URL) {
  console.error("Set TELEGRAM_BOT_TOKEN and WORKER_URL environment variables");
  process.exit(1);
}

async function main() {
  const webhookUrl = `${WORKER_URL}/webhook/telegram`;

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    }
  );

  const result = await response.json();
  console.log("Webhook setup result:", JSON.stringify(result, null, 2));

  // Set bot commands
  const commandsResponse = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyCommands`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: "start", description: "Initialize and connect Spotify" },
          { command: "status", description: "Check connection and queue status" },
          { command: "stats", description: "View learning statistics" },
          { command: "review", description: "Quiz on learned words" },
          { command: "pause", description: "Pause daily delivery" },
          { command: "resume", description: "Resume daily delivery" },
        ],
      }),
    }
  );

  const commandsResult = await commandsResponse.json();
  console.log("Commands setup result:", JSON.stringify(commandsResult, null, 2));
}

main().catch(console.error);
