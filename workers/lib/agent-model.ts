// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { createWorkersAI } from "workers-ai-provider";
import {
	isHostedWorkersAiModel,
	toCatalogModelId,
} from "../../shared/models";
import type { Env } from "../types";

/**
 * Built-in Email Agent model via env.AI.
 * @cf/... stays on hosted Workers AI.
 * Catalog slugs such as xai/grok-4.6 go through the default AI Gateway
 * (unified billing, no provider API key).
 */
export function createAgentLanguageModel(env: Env, modelId: string) {
	const catalogId = toCatalogModelId(modelId);
	const workersai = createWorkersAI({ binding: env.AI });
	const settings = isHostedWorkersAiModel(catalogId)
		? undefined
		: { gateway: { id: "default" } };

	return workersai(
		catalogId as Parameters<typeof workersai>[0],
		settings,
	);
}
