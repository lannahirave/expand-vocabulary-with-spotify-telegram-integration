Deploy the Spotify English Bot to Cloudflare Workers.

Steps:
1. Run `npx tsc --noEmit` to type-check. If there are errors, fix them before proceeding.
2. Run `npx wrangler deploy` to deploy the worker.
3. If the user mentioned schema changes or you detect modifications to `src/db/schema.sql`, ask the user whether to apply them with `npx wrangler d1 execute spotify-english-bot --remote --file=src/db/schema.sql`. Warn that this will recreate tables and existing data will be lost unless tables are dropped first.
4. Report the deployed URL and version ID from the wrangler output.
