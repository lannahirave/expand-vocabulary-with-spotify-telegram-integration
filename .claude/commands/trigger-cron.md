Trigger the cron job manually to deliver words to all active users.

Steps:
1. Run `npx tsx scripts/trigger-cron.ts` and show the response.
2. After triggering, run `npx wrangler d1 execute spotify-english-bot --remote --command="SELECT telegram_id FROM user WHERE is_active = 1"` to show which users were processed.
