// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { routeAgentRequest } from "agents";
import { type Context, Hono } from "hono";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { createRequestHandler } from "react-router";
import { app as apiApp, receiveEmail } from "./index";
import { lookupMailboxToken, parseBearerToken } from "./lib/mcp-tokens";
import { EmailMCP } from "./mcp";
import type { Env } from "./types";

type WorkerContext = {
	Bindings: Env;
	Variables: {
		pinnedMailboxId?: string;
		pinnedFromAddress?: string;
	};
};

export { MailboxDO } from "./durableObject";
export { EmailAgent } from "./agent";
export { EmailMCP } from "./mcp";

declare module "react-router" {
	export interface AppLoadContext {
		cloudflare: {
			env: Env;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

function getAccessUrls(teamDomain: string) {
	const certsPath = "/cdn-cgi/access/certs";
	const teamUrl = new URL(teamDomain);
	const issuer = teamUrl.origin;
	const certsUrl = teamUrl.pathname.endsWith(certsPath)
		? teamUrl
		: new URL(certsPath, issuer);

	return { issuer, certsUrl };
}

const app = new Hono<WorkerContext>();

function isMcpPath(path: string): boolean {
	return path === "/mcp" || path.startsWith("/mcp/");
}

function withMcpProps(
	ctx: ExecutionContext,
	mailboxId: string | undefined,
	fromAddress?: string,
): ExecutionContext {
	(ctx as ExecutionContext & { props?: { mailboxId?: string; fromAddress?: string } }).props = mailboxId
		? { mailboxId, fromAddress: fromAddress ?? mailboxId }
		: {};
	return ctx;
}

// Cloudflare Access JWT validation (production only).
// /mcp accepts a mailbox-scoped Bearer token so Grok Bot can connect
// without a browser Access JWT.
app.use("*", async (c, next) => {
	if (isMcpPath(c.req.path)) {
		const bearer = parseBearerToken(c.req.header("Authorization"));
		if (bearer) {
			const record = await lookupMailboxToken(c.env.BUCKET, bearer);
			const mailboxExists =
				record !== null &&
				(await c.env.BUCKET.head(`mailboxes/${record.mailboxId}.json`));
			if (!record || !mailboxExists) {
				return c.text("Invalid mailbox token", 401, {
					"WWW-Authenticate": 'Bearer realm="mcp", error="invalid_token"',
				});
			}
			c.set("pinnedMailboxId", record.mailboxId);
			c.set("pinnedFromAddress", record.fromAddress ?? record.mailboxId);
			return next();
		}
	}

	if (import.meta.env.DEV) {
		return next();
	}

	const { POLICY_AUD, TEAM_DOMAIN } = c.env;

	if (!POLICY_AUD || !TEAM_DOMAIN) {
		return c.text(
			"Cloudflare Access must be configured in production. Set POLICY_AUD and TEAM_DOMAIN.",
			500,
		);
	}

	const token = c.req.header("cf-access-jwt-assertion");
	if (!token) {
		return c.text("Missing required CF Access JWT", 403);
	}

	try {
		const { issuer, certsUrl } = getAccessUrls(TEAM_DOMAIN);
		const JWKS = createRemoteJWKSet(certsUrl);
		await jwtVerify(token, JWKS, {
			issuer,
			audience: POLICY_AUD,
		});
	} catch {
		return c.text("Invalid or expired Access token", 403);
	}

	// Authorization model: Access lets humans see every mailbox in the UI.
	// Mailbox tokens on /mcp are the per-mailbox boundary for agents.
	return next();
});

const mcpHandler = EmailMCP.serve("/mcp", { binding: "EMAIL_MCP" });

async function handleMcp(c: Context<WorkerContext>) {
	// Always use McpAgent.serve(). It addresses EmailMCP via getAgentByName
	// so PartyServer gets namespace/room headers. A raw Durable Object
	// stub.fetch() skips that and returns 500. Mailbox tokens stay pinned
	// through ctx.props.mailboxId.
	const ctx = withMcpProps(
		c.executionCtx as ExecutionContext,
		c.var.pinnedMailboxId,
		c.var.pinnedFromAddress,
	);
	return mcpHandler.fetch(c.req.raw, c.env, ctx);
}

app.all("/mcp", async (c) => handleMcp(c));
app.all("/mcp/*", async (c) => handleMcp(c));

app.route("/", apiApp);

app.all("/agents/*", async (c) => {
	const response = await routeAgentRequest(c.req.raw, c.env);
	if (response) return response;
	return c.text("Agent not found", 404);
});

app.all("*", (c) => {
	return requestHandler(c.req.raw, {
		cloudflare: { env: c.env, ctx: c.executionCtx as ExecutionContext },
	});
});

export default {
	fetch: app.fetch,
	async email(
		event: { raw: ReadableStream; rawSize: number },
		env: Env,
		ctx: ExecutionContext,
	) {
		try {
			await receiveEmail(event, env, ctx);
		} catch (e) {
			console.error("Failed to process incoming email:", (e as Error).message, (e as Error).stack);
			throw e;
		}
	},
};
