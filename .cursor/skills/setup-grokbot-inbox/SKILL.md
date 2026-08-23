---
name: setup-grokbot-inbox
description: Deploy this Grok Bot inbox template to the operator's own Cloudflare account. Use when someone clones the template and needs Email Routing, wrangler vars, Access bypass for /mcp, and a mailbox token.
---

# Setup Grok Bot Inbox

Help the operator deploy **their** copy of this template. Never reuse another account's `account_id`, Access AUD, team domain, or mailbox token.

## Defaults in this repo

- Worker and R2 name: `grokbot-inbox`
- `vars.DOMAINS`: `example.com` (placeholder — replace)
- No `account_id` in `wrangler.jsonc` (Wrangler uses the logged-in account)

## Checklist

1. Confirm they are logged into **their** Cloudflare account (`wrangler whoami`).
2. Ask for **their** zone. Call it `DOMAIN`. Do not default to a production hostname.
3. Set `vars.DOMAINS` to `DOMAIN` (comma-separated if they have more than one).
4. Create R2: `wrangler r2 bucket create grokbot-inbox` (or the name in `wrangler.jsonc`).
5. `npx wrangler deploy`.
6. Enable Email Routing on `DOMAIN`. Point catch-all or individual addresses at this Worker.
7. Create a mailbox in the UI.
8. **MCP → Connect**: create a `gbx_` token. Show it once. Do not write it into git, issues, or chat logs if it can be avoided.
9. In Grok Bot, add MCP URL `https://<worker-host>/mcp` with that Bearer token.

## Access

Access on the **web UI** is optional.

Access on `/mcp` is unsupported. Grok Bot cannot satisfy an Access JWT. Bypass `/mcp` (and `/sse` if used) or keep those paths public.

## Models

Optional `wrangler.jsonc` vars:

- `AGENT_MODEL`
- `INJECTION_MODEL`
- `VERIFIER_MODEL`

Leave the catalog defaults unless they ask to change them.

## Aliases

Settings → Addresses can add `local+tag@DOMAIN` (or another address on a configured zone) as send-as / inbound aliases for one mailbox.

## Do not

- Deploy this template onto an account the operator did not name
- Commit tokens, AUDs, or account IDs
- Copy configuration from a private `-dev` repo or any other live inbox
