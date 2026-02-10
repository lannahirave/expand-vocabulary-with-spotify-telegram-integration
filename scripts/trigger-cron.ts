// Run with: npx tsx scripts/trigger-cron.ts
// Reads from .dev.vars or environment variables

import { loadEnv } from "./load-env";
loadEnv();

const WORKER_URL = process.env.WORKER_URL;

if (!WORKER_URL) {
  console.error("Missing WORKER_URL in .dev.vars");
  process.exit(1);
}

async function main() {
  console.log(`Triggering cron at ${WORKER_URL}/cron/trigger ...`);

  const response = await fetch(`${WORKER_URL}/cron/trigger`);
  const text = await response.text();

  console.log(`Status: ${response.status}`);
  console.log(`Response: ${text}`);
}

main().catch(console.error);
