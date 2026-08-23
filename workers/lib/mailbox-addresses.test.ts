// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	AliasConflictError,
	aliasIndexKey,
	assertAddressAvailable,
	assertAliasAllowedByConfig,
	deleteMailboxAliases,
	getMailboxAddresses,
	isAllowedFrom,
	isMailboxSettingsKey,
	mailboxAddresses,
	mailboxSettingsKey,
	normalizeAliases,
	normalizeEmail,
	replaceMailboxAliases,
	resolveInboundMailbox,
	resolveMailboxIdForAddress,
} from "./mailbox-addresses.ts";

type Stored = { json: unknown };

class MemoryBucket {
	#objects = new Map<string, Stored>();

	async head(key: string): Promise<{ key: string } | null> {
		return this.#objects.has(key) ? { key } : null;
	}

	async get(key: string): Promise<{ json: () => Promise<unknown> } | null> {
		const stored = this.#objects.get(key);
		if (!stored) return null;
		return { json: async () => stored.json };
	}

	async put(key: string, value: string): Promise<void> {
		this.#objects.set(key, { json: JSON.parse(value) });
	}

	async delete(keys: string | string[]): Promise<void> {
		for (const key of Array.isArray(keys) ? keys : [keys]) {
			this.#objects.delete(key);
		}
	}
}

function asBucket(bucket: MemoryBucket): R2Bucket {
	return bucket as unknown as R2Bucket;
}

describe("mailbox address helpers", () => {
	it("normalizes and drops the primary, duplicates, and junk", () => {
		assert.equal(normalizeEmail("  Ops@Example.COM "), "ops@example.com");
		assert.deepEqual(
			normalizeAliases(
				[
					"researcher@example.com",
					"RESEARCHER@example.com",
					"assistant@example.com",
					"not-an-email",
					"  ops@example.com  ",
					123,
				],
				"assistant@example.com",
			),
			["researcher@example.com", "ops@example.com"],
		);
	});

	it("treats primary plus aliases as the allowed From set", () => {
		assert.deepEqual(
			mailboxAddresses("Assistant@example.com", ["ops@example.com"]),
			["assistant@example.com", "ops@example.com"],
		);
		assert.equal(
			isAllowedFrom("ops@example.com", "assistant@example.com", [
				"ops@example.com",
			]),
			true,
		);
		assert.equal(
			isAllowedFrom("other@example.com", "assistant@example.com", [
				"ops@example.com",
			]),
			false,
		);
	});

	it("only treats mailboxes/{email}.json as a mailbox settings object", () => {
		assert.equal(
			isMailboxSettingsKey("mailboxes/assistant@example.com.json"),
			true,
		);
		assert.equal(
			isMailboxSettingsKey(
				"mailboxes/assistant@example.com/tokens/abc.json",
			),
			false,
		);
		assert.equal(
			mailboxSettingsKey("Assistant@example.com"),
			"mailboxes/assistant@example.com.json",
		);
		assert.equal(
			aliasIndexKey("Ops@example.com"),
			"mailbox-aliases/ops@example.com.json",
		);
	});

	it("enforces EMAIL_ADDRESSES and DOMAINS when they are set", () => {
		assert.doesNotThrow(() =>
			assertAliasAllowedByConfig("ops@example.com", {
				domains: ["example.com"],
				emailAddresses: ["assistant@example.com", "ops@example.com"],
			}),
		);
		assert.throws(
			() =>
				assertAliasAllowedByConfig("ops@other.com", {
					domains: ["example.com"],
				}),
			AliasConflictError,
		);
		assert.throws(
			() =>
				assertAliasAllowedByConfig("ghost@example.com", {
					emailAddresses: ["assistant@example.com"],
				}),
			AliasConflictError,
		);
	});
});

describe("mailbox alias index", () => {
	it("resolves a primary or an alias to the owning mailbox", async () => {
		const bucket = new MemoryBucket();
		await bucket.put(
			mailboxSettingsKey("assistant@example.com"),
			JSON.stringify({
				fromName: "Assistant",
				aliases: ["ops@example.com"],
			}),
		);
		await bucket.put(
			aliasIndexKey("ops@example.com"),
			JSON.stringify({ mailboxId: "assistant@example.com" }),
		);

		assert.equal(
			await resolveMailboxIdForAddress(
				asBucket(bucket),
				"assistant@example.com",
			),
			"assistant@example.com",
		);
		assert.equal(
			await resolveMailboxIdForAddress(asBucket(bucket), "OPS@example.com"),
			"assistant@example.com",
		);
		assert.equal(
			await resolveInboundMailbox(asBucket(bucket), [
				"nobody@example.com",
				"ops@example.com",
			]),
			"assistant@example.com",
		);
		assert.deepEqual(
			await getMailboxAddresses(asBucket(bucket), "assistant@example.com"),
			["assistant@example.com", "ops@example.com"],
		);
	});

	it("refuses an alias that is already a mailbox or another mailbox's alias", async () => {
		const bucket = new MemoryBucket();
		await bucket.put(
			mailboxSettingsKey("assistant@example.com"),
			JSON.stringify({ aliases: [] }),
		);
		await bucket.put(
			mailboxSettingsKey("ops@example.com"),
			JSON.stringify({ aliases: [] }),
		);
		await bucket.put(
			aliasIndexKey("research@example.com"),
			JSON.stringify({ mailboxId: "assistant@example.com" }),
		);

		await assert.rejects(
			() =>
				assertAddressAvailable(
					asBucket(bucket),
					"ops@example.com",
					"assistant@example.com",
				),
			/already a mailbox/,
		);
		await assert.rejects(
			() =>
				assertAddressAvailable(
					asBucket(bucket),
					"research@example.com",
					"ops@example.com",
				),
			/already an alias/,
		);
		await assertAddressAvailable(
			asBucket(bucket),
			"research@example.com",
			"assistant@example.com",
		);
	});

	it("syncs alias index keys when aliases are added or removed", async () => {
		const bucket = new MemoryBucket();
		await bucket.put(
			mailboxSettingsKey("assistant@example.com"),
			JSON.stringify({ aliases: [] }),
		);

		const added = await replaceMailboxAliases(
			asBucket(bucket),
			"assistant@example.com",
			[],
			["ops@example.com", "research@example.com"],
		);
		assert.deepEqual(added, ["ops@example.com", "research@example.com"]);
		assert.equal(
			await resolveMailboxIdForAddress(asBucket(bucket), "ops@example.com"),
			"assistant@example.com",
		);

		const next = await replaceMailboxAliases(
			asBucket(bucket),
			"assistant@example.com",
			added,
			["ops@example.com"],
		);
		assert.deepEqual(next, ["ops@example.com"]);
		assert.equal(
			await resolveMailboxIdForAddress(
				asBucket(bucket),
				"research@example.com",
			),
			null,
		);

		await deleteMailboxAliases(
			asBucket(bucket),
			next,
			"assistant@example.com",
		);
		assert.equal(
			await resolveMailboxIdForAddress(asBucket(bucket), "ops@example.com"),
			null,
		);
	});
});
