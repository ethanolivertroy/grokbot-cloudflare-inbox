---
name: setup-grokbot-inbox
description: Deploy this Grok Bot inbox template to the operator's own Cloudflare account. Use when someone clones the template and needs Email Routing, wrangler vars, Access bypass for /mcp, and a mailbox token.
---

# Setup Grok Bot Inbox

Help the operator deploy **their** copy of this template. Never reuse another account's `account_id`, Access AUD, team domain, or mailbox token.

Use the repository-root [`grokbot.md`](../../../grokbot.md) as the complete public runbook and security contract. This skill is only the short checklist.

## Defaults in this repo

- Worker and R2 name: `grokbot-inbox`
- `vars.DOMAINS`: `example.com` (placeholder: replace it)
- No `account_id` in `wrangler.jsonc` (Wrangler uses the logged-in account)

## Checklist

1. Follow `grokbot.md` Step 1 to capture `wrangler whoami --json` in the restricted temporary directory. Inspect it locally, report only pass or fail, and delete it. Never run the command bare in an agent session.
2. Ask for **their** zone. Call it `DOMAIN`. Do not default to a production hostname.
3. Set `vars.DOMAINS` to `DOMAIN` (comma-separated if they have more than one).
4. Check for an existing Worker and R2 bucket with the intended names. Stop on a collision unless the operator explicitly identifies those exact resources.
5. Create R2: `wrangler r2 bucket create grokbot-inbox` (or the name in `wrangler.jsonc`).
6. `npx wrangler deploy`.
7. Enable Email Routing on `DOMAIN`. Point catch-all or individual addresses at this Worker.
8. Create a mailbox in the UI.
9. Confirm the operator accepts account-wide Plugin scope, check team MCP policy, and prepare a protected credential field for `https://<worker-host>/mcp`.
10. Open the right-side **Connect** tab, create a mailbox token, and move it directly into that protected field. If protected storage is unavailable, revoke it and stop. Never put it in git, issues, chat, instructions, shell history, or files on Grok Bot's shared computer.

## Access

Production requires `POLICY_AUD` and `TEAM_DOMAIN` for the **web UI**.

An Access login on `/mcp` is unsupported. Grok Bot uses a mailbox-scoped Bearer token. If the UI hostname application covers every path, create separate Access applications for `/mcp` and `/mcp/*` and attach Bypass policies only to those path applications. Never bypass the hostname-wide UI application.

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
- Copy configuration from another live inbox or private environment
