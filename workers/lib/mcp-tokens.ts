// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Mailbox-scoped tokens for MCP clients (Grok Bot, Cursor, Claude Code).
 *
 * The secret is shown once at create time. Only a SHA-256 hash is stored.
 * Lookup is O(1) via mcp-tokens/{hash}.json; each mailbox also keeps a
 * listing object at mailboxes/{mailboxId}/tokens/{tokenId}.json.
 */

export const MCP_TOKEN_PREFIX = "gbx_";
export const MCP_TOKEN_MAX_PER_MAILBOX = 10;

export type MailboxTokenRecord = {
	id: string;
	mailboxId: string;
	prefix: string;
	createdAt: string;
	hash: string;
	fromAddress?: string;
};

export type MailboxTokenPublic = {
	id: string;
	prefix: string;
	createdAt: string;
	fromAddress: string;
};

function tokenLookupKey(hash: string): string {
	return `mcp-tokens/${hash}.json`;
}

function tokenIndexKey(mailboxId: string, tokenId: string): string {
	return `mailboxes/${mailboxId}/tokens/${tokenId}.json`;
}

function tokenIndexPrefix(mailboxId: string): string {
	return `mailboxes/${mailboxId}/tokens/`;
}

export async function sha256Hex(value: string): Promise<string> {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export function parseBearerToken(authorization: string | undefined): string | null {
	if (!authorization) return null;
	const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
	if (!match) return null;
	const token = match[1];
	if (!token.startsWith(MCP_TOKEN_PREFIX) || token.length < MCP_TOKEN_PREFIX.length + 16) {
		return null;
	}
	return token;
}

function generateSecret(): { token: string; prefix: string } {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	const body = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
	const token = `${MCP_TOKEN_PREFIX}${body}`;
	return { token, prefix: token.slice(0, 12) };
}

export async function listMailboxTokens(
	bucket: R2Bucket,
	mailboxId: string,
): Promise<MailboxTokenPublic[]> {
	const listed = await bucket.list({ prefix: tokenIndexPrefix(mailboxId) });
	const tokens: MailboxTokenPublic[] = [];
	for (const obj of listed.objects) {
		const body = await bucket.get(obj.key);
		if (!body) continue;
		const record = (await body.json()) as MailboxTokenRecord;
		tokens.push({
			id: record.id,
			prefix: record.prefix,
			createdAt: record.createdAt,
			fromAddress: record.fromAddress ?? record.mailboxId,
		});
	}
	tokens.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	return tokens;
}

export async function createMailboxToken(
	bucket: R2Bucket,
	mailboxId: string,
	options?: { fromAddress?: string },
): Promise<{ token: string } & MailboxTokenPublic> {
	const existing = await listMailboxTokens(bucket, mailboxId);
	if (existing.length >= MCP_TOKEN_MAX_PER_MAILBOX) {
		throw new TokenLimitError(
			`This mailbox already has ${MCP_TOKEN_MAX_PER_MAILBOX} tokens. Revoke one before creating another.`,
		);
	}

	const { token, prefix } = generateSecret();
	const hash = await sha256Hex(token);
	const fromAddress = (options?.fromAddress ?? mailboxId).toLowerCase();
	const record: MailboxTokenRecord = {
		id: crypto.randomUUID(),
		mailboxId: mailboxId.toLowerCase(),
		prefix,
		createdAt: new Date().toISOString(),
		hash,
		fromAddress,
	};

	await bucket.put(tokenLookupKey(hash), JSON.stringify(record));
	await bucket.put(tokenIndexKey(record.mailboxId, record.id), JSON.stringify(record));

	return {
		id: record.id,
		token,
		prefix: record.prefix,
		createdAt: record.createdAt,
		fromAddress,
	};
}

export async function lookupMailboxToken(
	bucket: R2Bucket,
	token: string,
): Promise<MailboxTokenRecord | null> {
	const hash = await sha256Hex(token);
	const obj = await bucket.get(tokenLookupKey(hash));
	if (!obj) return null;
	const record = (await obj.json()) as MailboxTokenRecord;
	if (record.mailboxId) return record;
	return null;
}

export async function revokeMailboxToken(
	bucket: R2Bucket,
	mailboxId: string,
	tokenId: string,
): Promise<boolean> {
	const key = tokenIndexKey(mailboxId.toLowerCase(), tokenId);
	const obj = await bucket.get(key);
	if (!obj) return false;
	const record = (await obj.json()) as MailboxTokenRecord;
	await bucket.delete([key, tokenLookupKey(record.hash)]);
	return true;
}

export async function revokeAllMailboxTokens(
	bucket: R2Bucket,
	mailboxId: string,
): Promise<void> {
	const listed = await bucket.list({ prefix: tokenIndexPrefix(mailboxId) });
	const keys: string[] = [];
	for (const obj of listed.objects) {
		const body = await bucket.get(obj.key);
		if (!body) continue;
		const record = (await body.json()) as MailboxTokenRecord;
		keys.push(obj.key, tokenLookupKey(record.hash));
	}
	if (keys.length > 0) await bucket.delete(keys);
}

export class TokenLimitError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TokenLimitError";
	}
}
