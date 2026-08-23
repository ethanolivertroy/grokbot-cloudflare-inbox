// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	DEFAULT_AGENT_MODEL,
	DEFAULT_INJECTION_MODEL,
	DEFAULT_VERIFIER_MODEL,
} from "../../shared/models";
import type { Env } from "../types";

export type InboxModels = {
	agent: string;
	injection: string;
	verifier: string;
};

function firstNonEmpty(...values: Array<unknown>): string | undefined {
	for (const value of values) {
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}

export async function loadMailboxSettings(
	env: Env,
	mailboxId: string,
): Promise<Record<string, unknown>> {
	try {
		const obj = await env.BUCKET.get(`mailboxes/${mailboxId}.json`);
		if (!obj) return {};
		const settings = await obj.json<Record<string, unknown>>();
		return settings && typeof settings === "object" ? settings : {};
	} catch {
		return {};
	}
}

/**
 * Mailbox Settings override Worker vars, which override the built-in defaults.
 */
function envVar(env: Env, key: string): unknown {
	return (env as unknown as Record<string, unknown>)[key];
}

export function resolveInboxModels(
	env: Env,
	settings?: Record<string, unknown> | null,
): InboxModels {
	return {
		agent:
			firstNonEmpty(settings?.agentModel, envVar(env, "AGENT_MODEL")) ??
			DEFAULT_AGENT_MODEL,
		injection:
			firstNonEmpty(settings?.injectionModel, envVar(env, "INJECTION_MODEL")) ??
			DEFAULT_INJECTION_MODEL,
		verifier:
			firstNonEmpty(settings?.verifierModel, envVar(env, "VERIFIER_MODEL")) ??
			DEFAULT_VERIFIER_MODEL,
	};
}

export async function resolveMailboxModels(
	env: Env,
	mailboxId: string,
): Promise<InboxModels> {
	return resolveInboxModels(env, await loadMailboxSettings(env, mailboxId));
}
