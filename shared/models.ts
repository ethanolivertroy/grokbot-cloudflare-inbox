// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Default models for the built-in Email Agent.
 * Override per deploy via wrangler vars, or per mailbox in Settings.
 *
 * Hosted Workers AI ids start with @cf/. Third-party catalog ids use
 * author/model (for example xai/grok-4.6) and go through the same env.AI binding.
 */

export const DEFAULT_AGENT_MODEL = "@cf/moonshotai/kimi-k2.5";
export const DEFAULT_INJECTION_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
export const DEFAULT_VERIFIER_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

/** Catalog id shown in Settings copy. Bare grok-* ids are normalized to this form. */
export const EXAMPLE_GROK_MODEL = "xai/grok-4.6";

export function isGrokModel(modelId: string): boolean {
	const id = modelId.trim().toLowerCase();
	return (
		id.startsWith("grok-") ||
		id.startsWith("xai/grok") ||
		id.startsWith("grok/")
	);
}

export function grokModelName(modelId: string): string {
	const trimmed = modelId.trim();
	const slash = trimmed.lastIndexOf("/");
	return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

/** Map Settings / env values onto a Cloudflare AI catalog id. */
export function toCatalogModelId(modelId: string): string {
	const trimmed = modelId.trim();
	if (isGrokModel(trimmed)) {
		return `xai/${grokModelName(trimmed)}`;
	}
	return trimmed;
}

export function isHostedWorkersAiModel(modelId: string): boolean {
	return toCatalogModelId(modelId).startsWith("@cf/");
}
