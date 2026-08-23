// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Optional extra addresses on a mailbox.
 *
 * Default is still one address per inbox. Aliases are a user decision:
 * extra To-addresses deliver into the same store, and a mailbox token
 * can send as one of those identities.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AliasIndexRecord = {
	mailboxId: string;
};

export class AliasConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AliasConflictError";
	}
}

export function normalizeEmail(value: string): string {
	return value.trim().toLowerCase();
}

export function isMailboxSettingsKey(key: string): boolean {
	return /^mailboxes\/[^/]+\.json$/.test(key);
}

export function mailboxSettingsKey(mailboxId: string): string {
	return `mailboxes/${normalizeEmail(mailboxId)}.json`;
}

export function aliasIndexKey(alias: string): string {
	return `mailbox-aliases/${normalizeEmail(alias)}.json`;
}

export function normalizeAliases(aliases: unknown, primary: string): string[] {
	if (!Array.isArray(aliases)) return [];
	const primaryNorm = normalizeEmail(primary);
	const seen = new Set<string>();
	const out: string[] = [];
	for (const item of aliases) {
		if (typeof item !== "string") continue;
		const alias = normalizeEmail(item);
		if (!EMAIL_RE.test(alias)) continue;
		if (alias === primaryNorm) continue;
		if (seen.has(alias)) continue;
		seen.add(alias);
		out.push(alias);
	}
	return out;
}

export function mailboxAddresses(primary: string, aliases?: unknown): string[] {
	const primaryNorm = normalizeEmail(primary);
	return [primaryNorm, ...normalizeAliases(aliases, primaryNorm)];
}

export function isAllowedFrom(
	from: string,
	primary: string,
	aliases?: unknown,
): boolean {
	return mailboxAddresses(primary, aliases).includes(normalizeEmail(from));
}

export function assertAliasAllowedByConfig(
	alias: string,
	options: { domains?: string[]; emailAddresses?: string[] },
): void {
	const addr = normalizeEmail(alias);
	if (!EMAIL_RE.test(addr)) {
		throw new AliasConflictError(`${addr} is not a valid email address`);
	}

	const allowed = (options.emailAddresses ?? [])
		.map(normalizeEmail)
		.filter(Boolean);
	if (allowed.length > 0 && !allowed.includes(addr)) {
		throw new AliasConflictError(`${addr} is not in EMAIL_ADDRESSES`);
	}

	const domains = (options.domains ?? [])
		.map((domain) => domain.trim().toLowerCase())
		.filter(Boolean);
	const domain = addr.split("@")[1];
	if (domains.length > 0 && domain && !domains.includes(domain)) {
		throw new AliasConflictError(`${addr} must use a configured domain`);
	}
}

export async function readMailboxSettings(
	bucket: R2Bucket,
	mailboxId: string,
): Promise<Record<string, unknown> | null> {
	const obj = await bucket.get(mailboxSettingsKey(mailboxId));
	if (!obj) return null;
	return (await obj.json()) as Record<string, unknown>;
}

export async function getMailboxAddresses(
	bucket: R2Bucket,
	mailboxId: string,
): Promise<string[]> {
	const settings = await readMailboxSettings(bucket, mailboxId);
	return mailboxAddresses(mailboxId, settings?.aliases);
}

export async function resolveMailboxIdForAddress(
	bucket: R2Bucket,
	address: string,
): Promise<string | null> {
	const addr = normalizeEmail(address);
	if (await bucket.head(mailboxSettingsKey(addr))) return addr;

	const aliasObj = await bucket.get(aliasIndexKey(addr));
	if (!aliasObj) return null;
	const record = (await aliasObj.json()) as AliasIndexRecord;
	if (!record.mailboxId) return null;
	const mailboxId = normalizeEmail(record.mailboxId);
	if (await bucket.head(mailboxSettingsKey(mailboxId))) return mailboxId;
	return null;
}

export async function resolveInboundMailbox(
	bucket: R2Bucket,
	recipients: string[],
): Promise<string | null> {
	for (const recipient of recipients) {
		const mailboxId = await resolveMailboxIdForAddress(bucket, recipient);
		if (mailboxId) return mailboxId;
	}
	return null;
}

export async function assertAddressAvailable(
	bucket: R2Bucket,
	address: string,
	ownerMailboxId?: string,
): Promise<void> {
	const addr = normalizeEmail(address);
	const owner = ownerMailboxId ? normalizeEmail(ownerMailboxId) : undefined;

	if (await bucket.head(mailboxSettingsKey(addr))) {
		if (addr !== owner) {
			throw new AliasConflictError(`${addr} is already a mailbox`);
		}
		return;
	}

	const aliasObj = await bucket.get(aliasIndexKey(addr));
	if (!aliasObj) return;
	const record = (await aliasObj.json()) as AliasIndexRecord;
	if (record.mailboxId && normalizeEmail(record.mailboxId) !== owner) {
		throw new AliasConflictError(
			`${addr} is already an alias of ${normalizeEmail(record.mailboxId)}`,
		);
	}
}

export async function replaceMailboxAliases(
	bucket: R2Bucket,
	mailboxId: string,
	previous: unknown,
	next: unknown,
): Promise<string[]> {
	const owner = normalizeEmail(mailboxId);
	const prevSet = new Set(normalizeAliases(previous, owner));
	const nextNorm = normalizeAliases(next, owner);
	const nextSet = new Set(nextNorm);

	for (const alias of nextNorm) {
		await assertAddressAvailable(bucket, alias, owner);
	}

	const toDelete = [...prevSet].filter((alias) => !nextSet.has(alias));
	if (toDelete.length > 0) {
		await bucket.delete(toDelete.map(aliasIndexKey));
	}
	for (const alias of nextNorm) {
		await bucket.put(
			aliasIndexKey(alias),
			JSON.stringify({ mailboxId: owner } satisfies AliasIndexRecord),
		);
	}
	return nextNorm;
}

export async function deleteMailboxAliases(
	bucket: R2Bucket,
	aliases: unknown,
	primary: string,
): Promise<void> {
	const keys = normalizeAliases(aliases, primary).map(aliasIndexKey);
	if (keys.length > 0) await bucket.delete(keys);
}
