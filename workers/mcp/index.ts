// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	toolListMailboxes,
	toolListEmails,
	toolGetEmail,
	toolGetThread,
	toolSearchEmails,
	toolDraftReply,
	toolDraftEmail,
	toolUpdateDraft,
	toolDeleteEmail,
	toolSendReply,
	toolSendEmail,
	toolMarkEmailRead,
	toolMoveEmail,
} from "../lib/tools";
import { Folders, FOLDER_TOOL_DESCRIPTION, MOVE_FOLDER_TOOL_DESCRIPTION } from "../../shared/folders";
import type { Env } from "../types";
import { normalizeAliases, readMailboxSettings } from "../lib/mailbox-addresses";

type McpProps = {
	mailboxId?: string;
	fromAddress?: string;
};

/** Wrap a plain result object into MCP content format. */
function mcpText(result: unknown) {
	return {
		content: [
			{ type: "text" as const, text: JSON.stringify(result, null, 2) },
		],
	};
}

/** Wrap an error string into MCP error format. */
function mcpError(message: string) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
		isError: true as const,
	};
}

/**
 * Wrap a result that may contain an `error` field into MCP format,
 * automatically setting isError when appropriate.
 */
function mcpResult(result: Record<string, unknown>) {
	if ("error" in result) {
		return {
			content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
			isError: true as const,
		};
	}
	return mcpText(result);
}

const mailboxIdField = z
	.string()
	.optional()
	.describe(
		"Mailbox address. Omit when connected with a mailbox token; the token already selects the mailbox.",
	);

function pinnedMailboxId(agent: EmailMCP): string | undefined {
	const fromProps = agent.props?.mailboxId;
	if (typeof fromProps === "string" && fromProps.includes("@")) {
		return fromProps.toLowerCase();
	}
	const name = agent.name;
	if (typeof name === "string" && name.startsWith("mailbox:")) {
		return name.slice("mailbox:".length).toLowerCase();
	}
	return undefined;
}

function pinnedFromAddress(agent: EmailMCP, mailboxId: string): string {
	const fromProps = agent.props?.fromAddress;
	if (typeof fromProps === "string" && fromProps.includes("@")) {
		return fromProps.toLowerCase();
	}
	return mailboxId;
}

/**
 * EmailMCP — exposes email tools over the Model Context Protocol.
 *
 * Mailbox tokens pin the inbox so Grok Bot and other agents do not pass
 * mailboxId. A Cloudflare Access session can still choose any mailbox.
 */
export class EmailMCP extends McpAgent<Env, unknown, McpProps> {
	server = new McpServer({
		name: "grokbot-inbox",
		version: "1.0.0",
	});

	async init() {
		const env = this.env;
		const agent = this;

		const verifyMailbox = async (mailboxId: string) => {
			const obj = await env.BUCKET.head(`mailboxes/${mailboxId}.json`);
			if (!obj) {
				return mcpError(`Mailbox "${mailboxId}" not found. Use list_mailboxes to see available mailboxes.`);
			}
			return null;
		};

		const resolveMailbox = async (requested: string | undefined) => {
			const pinned = pinnedMailboxId(agent);
			const mailboxId = (requested ?? pinned)?.toLowerCase();
			if (!mailboxId) {
				return {
					error: mcpError(
						"mailboxId is required. Create a mailbox token in the app and connect with it, or pass mailboxId.",
					),
				};
			}
			if (pinned && mailboxId !== pinned) {
				return { error: mcpError(`This token can only access ${pinned}.`) };
			}
			const denied = await verifyMailbox(mailboxId);
			if (denied) return { error: denied };
			return { mailboxId };
		};

		// ── list_mailboxes ─────────────────────────────────────────
		this.server.tool(
			"list_mailboxes",
			"List mailboxes this connection can use. A mailbox token returns only its pinned inbox.",
			{},
			async () => {
				const pinned = pinnedMailboxId(agent);
				if (pinned) {
					const settings = await readMailboxSettings(env.BUCKET, pinned);
					const aliases = normalizeAliases(settings?.aliases, pinned);
					const fromAddress = pinnedFromAddress(agent, pinned);
					return mcpText([{ id: pinned, email: pinned, aliases, fromAddress }]);
				}
				const result = await toolListMailboxes(env);
				return mcpText(result);
			},
		);

		// ── list_emails ────────────────────────────────────────────
		this.server.tool(
			"list_emails",
			"List emails in a mailbox folder. Returns email metadata (id, subject, sender, recipient, date, read/starred status, thread_id).",
			{
				mailboxId: mailboxIdField,
				folder: z
					.string()
					.default(Folders.INBOX)
					.describe(FOLDER_TOOL_DESCRIPTION),
				limit: z
					.number()
					.default(20)
					.describe("Maximum number of emails to return"),
				page: z
					.number()
					.default(1)
					.describe("Page number for pagination"),
			},
			async ({ mailboxId, folder, limit, page }) => {
				const resolved = await resolveMailbox(mailboxId);
				if ("error" in resolved) return resolved.error;
				const result = await toolListEmails(env, resolved.mailboxId, { folder, limit, page });
				return mcpText(result);
			},
		);

		// ── get_email ──────────────────────────────────────────────
		this.server.tool(
			"get_email",
			"Get a single email with its full body content. Use this to read the actual content of an email.",
			{
				mailboxId: mailboxIdField,
				emailId: z.string().describe("The email ID to retrieve"),
			},
			async ({ mailboxId, emailId }) => {
				const resolved = await resolveMailbox(mailboxId);
				if ("error" in resolved) return resolved.error;
				const result = await toolGetEmail(env, resolved.mailboxId, emailId);
				if ("error" in result) {
					return {
						content: [{ type: "text" as const, text: "Email not found" }],
						isError: true,
					};
				}
				return mcpText(result);
			},
		);

		// ── get_thread ─────────────────────────────────────────────
		this.server.tool(
			"get_thread",
			"Get all emails in a conversation thread. Returns all messages sorted chronologically.",
			{
				mailboxId: mailboxIdField,
				threadId: z
					.string()
					.describe("The thread_id to retrieve all messages for"),
			},
			async ({ mailboxId, threadId }) => {
				const resolved = await resolveMailbox(mailboxId);
				if ("error" in resolved) return resolved.error;
				const result = await toolGetThread(env, resolved.mailboxId, threadId);
				return mcpText(result);
			},
		);

		// ── search_emails ──────────────────────────────────────────
		this.server.tool(
			"search_emails",
			"Search for emails matching a query across subject and body fields.",
			{
				mailboxId: mailboxIdField,
				query: z.string().describe("Search query to match against subject and body"),
				folder: z
					.string()
					.optional()
					.describe("Optional folder to restrict search to"),
			},
			async ({ mailboxId, query, folder }) => {
				const resolved = await resolveMailbox(mailboxId);
				if ("error" in resolved) return resolved.error;
				const result = await toolSearchEmails(env, resolved.mailboxId, { query, folder });
				return mcpText(result);
			},
		);

		// ── draft_reply ────────────────────────────────────────────
		this.server.tool(
			"draft_reply",
			"Draft a reply to an email and save it to the Drafts folder. Does NOT send — saves a draft for review.",
			{
				mailboxId: mailboxIdField,
				originalEmailId: z
					.string()
					.describe("The ID of the email being replied to"),
				to: z.string().email().describe("Recipient email address"),
				subject: z.string().describe("Subject line (usually 'Re: ...')"),
				bodyHtml: z
					.string()
					.describe("The HTML body of the reply"),
			},
			async ({ mailboxId, originalEmailId, to, subject, bodyHtml }) => {
				const resolved = await resolveMailbox(mailboxId);
				if ("error" in resolved) return resolved.error;
				const result = await toolDraftReply(env, resolved.mailboxId, {
					originalEmailId,
					to,
					subject,
					body: bodyHtml,
					isPlainText: false,
					runVerifyDraft: true,
				});
				return mcpResult(result);
			},
		);

		// ── create_draft ───────────────────────────────────────────
		this.server.tool(
			"create_draft",
			"Create a new draft email. Can be a new email or a reply draft.",
			{
				mailboxId: mailboxIdField,
				to: z
					.string()
					.optional()
					.describe("Recipient email address (optional for early drafts)"),
				subject: z.string().describe("Subject line"),
				bodyHtml: z.string().describe("The HTML body of the draft"),
				in_reply_to: z
					.string()
					.optional()
					.describe("The ID of the email this draft is replying to (optional)"),
				thread_id: z
					.string()
					.optional()
					.describe("Thread ID to attach this draft to (optional)"),
			},
			async ({ mailboxId, to, subject, bodyHtml, in_reply_to, thread_id }) => {
				const resolved = await resolveMailbox(mailboxId);
				if ("error" in resolved) return resolved.error;
				const result = await toolDraftEmail(env, resolved.mailboxId, {
					to: to || "",
					subject,
					body: bodyHtml,
					isPlainText: false,
					runVerifyDraft: true,
					in_reply_to,
					thread_id,
				});
				if ("error" in result) {
					return mcpResult(result);
				}
				// Map the response to match the original create_draft output shape
				return mcpText({
					status: "draft_created",
					draftId: result.draftId,
					threadId: result.threadId,
					message: "Draft created in Drafts folder.",
				});
			},
		);

		// ── update_draft ───────────────────────────────────────────
		this.server.tool(
			"update_draft",
			"Update an existing draft email's content.",
			{
				mailboxId: mailboxIdField,
				draftId: z.string().describe("The ID of the draft to update"),
				to: z
					.string()
					.optional()
					.describe("Updated recipient email address"),
				subject: z.string().optional().describe("Updated subject line"),
				bodyHtml: z.string().optional().describe("Updated HTML body"),
			},
			async ({ mailboxId, draftId, to, subject, bodyHtml }) => {
				const resolved = await resolveMailbox(mailboxId);
				if ("error" in resolved) return resolved.error;
				const result = await toolUpdateDraft(env, resolved.mailboxId, {
					draftId,
					to,
					subject,
					bodyHtml,
				});
				if ("error" in result) {
					if (result.error === "Draft not found") {
						return {
							content: [{ type: "text" as const, text: "Draft not found" }],
							isError: true,
						};
					}
					return mcpResult(result);
				}
				return mcpText(result);
			},
		);

		// ── delete_email ───────────────────────────────────────────
		this.server.tool(
			"delete_email",
			"Permanently delete an email by ID.",
			{
				mailboxId: mailboxIdField,
				emailId: z.string().describe("The email ID to delete"),
			},
			async ({ mailboxId, emailId }) => {
				const resolved = await resolveMailbox(mailboxId);
				if ("error" in resolved) return resolved.error;
				const result = await toolDeleteEmail(env, resolved.mailboxId, emailId);
				return mcpResult(result);
			},
		);

		// ── send_reply ─────────────────────────────────────────────
		this.server.tool(
			"send_reply",
			"Send a reply to an email. Only call after drafting and getting confirmation.",
			{
				mailboxId: mailboxIdField,
				originalEmailId: z
					.string()
					.describe("The ID of the email being replied to"),
				to: z.string().email().describe("Recipient email address"),
				subject: z.string().describe("Subject line"),
				bodyHtml: z.string().describe("The HTML body of the reply"),
			},
			async ({ mailboxId, originalEmailId, to, subject, bodyHtml }) => {
				const resolved = await resolveMailbox(mailboxId);
				if ("error" in resolved) return resolved.error;
				const result = await toolSendReply(env, resolved.mailboxId, {
					originalEmailId,
					to,
					subject,
					bodyHtml,
					fromAddress: pinnedFromAddress(agent, resolved.mailboxId),
				});
				if ("error" in result) {
					// Preserve the original MCP error format for send failures
					if (typeof result.error === "string" && result.error.startsWith("Failed to send")) {
						return {
							content: [{ type: "text" as const, text: result.error }],
							isError: true,
						};
					}
					if (result.error === "Original email not found") {
						return {
							content: [{ type: "text" as const, text: "Original email not found" }],
							isError: true,
						};
					}
					return mcpResult(result);
				}
				return mcpText(result);
			},
		);

		// ── send_email ─────────────────────────────────────────────
		this.server.tool(
			"send_email",
			"Send a new email (not a reply). Only call after getting confirmation.",
			{
				mailboxId: mailboxIdField,
				to: z.string().email().describe("Recipient email address"),
				subject: z.string().describe("Subject line"),
				bodyHtml: z.string().describe("The HTML body of the email"),
			},
			async ({ mailboxId, to, subject, bodyHtml }) => {
				const resolved = await resolveMailbox(mailboxId);
				if ("error" in resolved) return resolved.error;
				const result = await toolSendEmail(env, resolved.mailboxId, {
					to,
					subject,
					bodyHtml,
					fromAddress: pinnedFromAddress(agent, resolved.mailboxId),
				});
				if ("error" in result) {
					if (typeof result.error === "string" && result.error.startsWith("Failed to send")) {
						return {
							content: [{ type: "text" as const, text: result.error }],
							isError: true,
						};
					}
					return mcpResult(result);
				}
				return mcpText(result);
			},
		);

		// ── mark_email_read ────────────────────────────────────────
		this.server.tool(
			"mark_email_read",
			"Mark an email as read or unread.",
			{
				mailboxId: mailboxIdField,
				emailId: z.string().describe("The email ID"),
				read: z.boolean().describe("true to mark as read, false for unread"),
			},
			async ({ mailboxId, emailId, read }) => {
				const resolved = await resolveMailbox(mailboxId);
				if ("error" in resolved) return resolved.error;
				const result = await toolMarkEmailRead(env, resolved.mailboxId, emailId, read);
				return mcpText(result);
			},
		);

		// ── move_email ─────────────────────────────────────────────
		this.server.tool(
			"move_email",
			"Move an email to a different folder (inbox, sent, draft, archive, trash).",
			{
				mailboxId: mailboxIdField,
				emailId: z.string().describe("The email ID"),
				folderId: z
					.string()
					.describe(MOVE_FOLDER_TOOL_DESCRIPTION),
			},
			async ({ mailboxId, emailId, folderId }) => {
				const resolved = await resolveMailbox(mailboxId);
				if ("error" in resolved) return resolved.error;
				const result = await toolMoveEmail(env, resolved.mailboxId, emailId, folderId);
				if ("error" in result) {
					return {
						content: [
							{
								type: "text" as const,
								text: JSON.stringify({ error: "Failed to move email" }),
							},
						],
						isError: true,
					};
				}
				return mcpText(result);
			},
		);
	}
}
