# Grok Bot Inbox

A self-hosted email inbox on Cloudflare Workers, packaged so [Grok Bot](https://grokbot.x.ai) can connect over MCP.

This repository is a public template based on [Cloudflare Agentic Inbox](https://github.com/cloudflare/agentic-inbox) (Apache 2.0). Use it to deploy **your** inbox on **your** Cloudflare account. Incoming mail arrives through [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/). Each mailbox is a [Durable Object](https://developers.cloudflare.com/durable-objects/) with SQLite. Attachments live in [R2](https://developers.cloudflare.com/r2/).

> This is not a hosted product and is not affiliated with xAI. You operate the Worker. Grok Bot is a client that calls your `/mcp` endpoint with a mailbox token.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ethanolivertroy/grokbot-cloudflare-inbox)

## Give this to Grok Bot

Point your agent at [`grokbot.md`](./grokbot.md), or use the [raw file](https://raw.githubusercontent.com/ethanolivertroy/grokbot-cloudflare-inbox/main/grokbot.md). It is a sanitized setup and operating guide with secret-handling rules, Cloudflare Access boundaries, MCP verification, and approval gates for sending email.

![Inbox screenshot](./demo_app.png)

## What you get

- Web inbox (threads, search, compose, labels)
- Optional AI agent on Workers AI
- MCP at `/mcp` for Grok Bot and other MCP clients
- Mailbox Bearer tokens (`gbx_…`) so bots can call MCP without wrapping `/mcp` in Cloudflare Access
- Optional aliases / send-as addresses on one mailbox (`user+label@example.com`)
- Configurable catalog models (`AGENT_MODEL`, `INJECTION_MODEL`, `VERIFIER_MODEL`)

## Deploy

1. Before clicking **Deploy to Cloudflare** or running a mutating command, follow [`grokbot.md` Step 1](./grokbot.md#1-verify-the-target). Stop if the intended Worker or R2 bucket already exists unless the operator explicitly identifies it as this inbox.
2. Clone the template and run `npm ci`, `npm test`, then `npm run build`.
3. Set your email zone in `wrangler.jsonc`:

   ```jsonc
   "vars": {
     "DOMAINS": "example.com"
   }
   ```

   Replace `example.com` with a zone you already added to Cloudflare.

4. Create the R2 bucket only after confirming the configured name is absent:

   ```bash
   npx wrangler r2 bucket create grokbot-inbox
   ```

5. Deploy the verified code:

   ```bash
   npx wrangler deploy
   ```

6. In the Cloudflare dashboard, enable **Email Routing** for that zone. Add a catch-all (or per-address) worker route that sends inbound mail to this Worker.
7. Open the deployed app and create a mailbox. Do not create a token until you have prepared Grok Bot's protected Plugin credential field below.

### Cloudflare Access

Production requires `POLICY_AUD` and `TEAM_DOMAIN` so the Worker can validate Cloudflare Access for the web UI. Do not require an Access login on `/mcp`; the Worker authenticates that path with a mailbox-scoped Bearer token.

Grok Bot sends `Authorization: Bearer gbx_…`. If Access wraps `/mcp`, the bot never reaches the Worker and you get 302 / JWT errors.

If the hostname application covers every path, create separate, more-specific Access applications for `/mcp` and `/mcp/*`. Attach Bypass policies only to those two path applications, never to the hostname-wide UI application.

### Grok Bot

Grok Bot exposes connectors as account-wide Plugins. Confirm that this mailbox may be available to all of the operator's Bots, check team MCP policy, then use **Settings -> Plugins** or the current Custom MCP flow to prepare:

| Field | Value |
| --- | --- |
| URL | `https://<your-worker>.workers.dev/mcp` |
| Header | `Authorization: Bearer <MAILBOX_TOKEN>` |

Once the protected header field is ready, create the token in the inbox's right-side **Connect** tab and move it directly into that field. If protected storage is unavailable, revoke it and stop. Do not store it in chat, instructions, source control, or the shared Grok Bot computer. The token pins the mailbox. Optional aliases can restrict the `From` address the bot uses when sending.

## Local development

```bash
npm install
npm test
npm run typecheck
npm run dev
```

Access checks are skipped in development. Point Email Routing at a deployed Worker for real inbound mail; local Vite does not receive Cloudflare email events. The Vite plugin keeps `remoteBindings` off so `npm run dev` does not require a Wrangler OAuth session.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DOMAINS` | `example.com` | Comma-separated zones this Worker accepts |
| `AGENT_MODEL` | `@cf/moonshotai/kimi-k2.5` | Agent / compose model |
| `INJECTION_MODEL` | `@cf/meta/llama-3.1-8b-instruct-fast` | Prompt-injection scan |
| `VERIFIER_MODEL` | `@cf/meta/llama-4-scout-17b-16e-instruct` | Action verifier |

Do not commit `account_id`, Access AUDs, team domains, or real `gbx_` tokens.

## License

Apache License 2.0. Copyright for the original Agentic Inbox belongs to Cloudflare, Inc. Grok Bot–oriented template changes are additional work on top of that codebase. See [LICENSE](./LICENSE).
