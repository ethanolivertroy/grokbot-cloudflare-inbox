// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader, Select, useKumoToastManager } from "@cloudflare/kumo";
import { RobotIcon, ArrowCounterClockwiseIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import {
	DEFAULT_AGENT_MODEL,
	DEFAULT_INJECTION_MODEL,
	DEFAULT_VERIFIER_MODEL,
	EXAMPLE_GROK_MODEL,
} from "shared/models";
import { mailboxAliases } from "~/lib/mailbox-display";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";
import { queryKeys } from "~/queries/keys";
import api, { ApiError } from "~/services/api";

const PROMPT_PLACEHOLDER = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.\n\nWrite like a real person. Short, direct, flowing prose. Plain text only.\n\n(Leave empty to use the full built-in default prompt)`;

export default function SettingsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toastManager = useKumoToastManager();
	const { data: mailbox } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();

	const [displayName, setDisplayName] = useState("");
	const [agentPrompt, setAgentPrompt] = useState("");
	const [agentModel, setAgentModel] = useState("");
	const [injectionModel, setInjectionModel] = useState("");
	const [verifierModel, setVerifierModel] = useState("");
	const [aliases, setAliases] = useState<string[]>([]);
	const [aliasPrefix, setAliasPrefix] = useState("");
	const [aliasDomain, setAliasDomain] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [isSavingAliases, setIsSavingAliases] = useState(false);

	const { data: configData } = useQuery({
		queryKey: queryKeys.config,
		queryFn: () => api.getConfig(),
		staleTime: Infinity,
	});
	const domains = configData?.domains ?? [];

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setAgentPrompt(mailbox.settings?.agentSystemPrompt || "");
			setAgentModel(mailbox.settings?.agentModel || "");
			setInjectionModel(mailbox.settings?.injectionModel || "");
			setVerifierModel(mailbox.settings?.verifierModel || "");
			setAliases(mailboxAliases(mailbox));
		}
	}, [mailbox]);

	useEffect(() => {
		if (aliasDomain) return;
		if (domains.length > 0) {
			setAliasDomain(domains[0]);
			return;
		}
		const mailboxDomain = mailbox?.email.split("@")[1];
		if (mailboxDomain) setAliasDomain(mailboxDomain);
	}, [domains, aliasDomain, mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: displayName,
			agentSystemPrompt: agentPrompt.trim() || undefined,
			agentModel: agentModel.trim() || undefined,
			injectionModel: injectionModel.trim() || undefined,
			verifierModel: verifierModel.trim() || undefined,
			aliases,
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toastManager.add({ title: "Settings saved!" });
		} catch {
			toastManager.add({
				title: "Failed to save settings",
				variant: "error",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const persistAliases = async (nextAliases: string[]) => {
		if (!mailbox || !mailboxId) return;
		setIsSavingAliases(true);
		try {
			await updateMailboxMutation.mutateAsync({
				mailboxId,
				settings: {
					...mailbox.settings,
					aliases: nextAliases,
				},
			});
			setAliases(nextAliases);
			setAliasPrefix("");
		} catch (err) {
			toastManager.add({
				title: err instanceof ApiError ? err.message : "Could not update aliases",
				variant: "error",
			});
		} finally {
			setIsSavingAliases(false);
		}
	};

	const handleAddAlias = async () => {
		if (!mailbox || !aliasPrefix || !aliasDomain) return;
		const alias = `${aliasPrefix.trim().toLowerCase()}@${aliasDomain}`;
		if (alias === mailbox.email.toLowerCase() || aliases.includes(alias)) {
			toastManager.add({
				title: "That address is already on this mailbox",
				variant: "error",
			});
			return;
		}
		await persistAliases([...aliases, alias]);
	};

	if (!mailbox) {
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}

	const isCustomPrompt = agentPrompt.trim().length > 0;

	return (
		<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
			<h1 className="text-lg font-semibold text-kumo-default mb-6">Settings</h1>

			<div className="space-y-6">
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-1">
						Addresses
					</div>
					<p className="text-xs text-kumo-subtle mb-4 leading-relaxed">
						Mail to the inbox address and any aliases stays in this
						mailbox. Leave aliases empty unless each bot needs its own
						From address.
					</p>
					<div className="space-y-3">
						<Input
							label="Display name"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
						/>
						<Input
							label="Inbox address"
							type="email"
							value={mailbox.email}
							disabled
						/>
					</div>
					<div className="mt-5 pt-4 border-t border-kumo-line">
						<div className="text-xs font-medium text-kumo-strong mb-2">
							Aliases
						</div>
						{aliases.length > 0 && (
							<div className="space-y-1.5 mb-3">
								{aliases.map((alias) => (
									<div
										key={alias}
										className="flex items-center gap-2 rounded-md bg-kumo-recessed px-3 py-2"
									>
										<div className="min-w-0 flex-1 text-sm text-kumo-default truncate">
											{alias}
										</div>
										<Button
											variant="ghost"
											size="sm"
											shape="square"
											icon={<TrashIcon size={14} />}
											aria-label={`Remove alias ${alias}`}
											disabled={isSavingAliases}
											onClick={() => persistAliases(aliases.filter((item) => item !== alias))}
										/>
									</div>
								))}
							</div>
						)}
						<div className="flex items-end gap-2">
							<div className="flex-1">
								<Input
									label="Add alias"
									aria-label="Alias prefix"
									placeholder="researcher"
									value={aliasPrefix}
									onChange={(e) => setAliasPrefix(e.target.value)}
								/>
							</div>
							<span className="text-sm text-kumo-subtle pb-2">@</span>
							{domains.length > 1 ? (
								<div className="flex-1 pb-0.5">
									<Select
										aria-label="Alias domain"
										value={aliasDomain}
										onValueChange={(value) => {
											if (value) setAliasDomain(value);
										}}
									>
										{domains.map((domain) => (
											<Select.Option key={domain} value={domain}>
												{domain}
											</Select.Option>
										))}
									</Select>
								</div>
							) : (
								<span className="text-sm text-kumo-subtle pb-2">
									{aliasDomain || mailbox.email.split("@")[1] || "domain"}
								</span>
							)}
							<Button
								size="sm"
								icon={<PlusIcon size={14} />}
								disabled={isSavingAliases || !aliasPrefix || !aliasDomain}
								onClick={handleAddAlias}
							>
								Add
							</Button>
						</div>
					</div>
				</div>

				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<RobotIcon size={16} weight="duotone" className="text-kumo-subtle" />
							<span className="text-sm font-medium text-kumo-default">
								AI Agent Prompt
							</span>
							{isCustomPrompt ? (
								<Badge variant="primary">Custom</Badge>
							) : (
								<Badge variant="secondary">Default</Badge>
							)}
						</div>
						{isCustomPrompt && (
							<Button
								variant="ghost"
								size="xs"
								icon={<ArrowCounterClockwiseIcon size={14} />}
								onClick={() => setAgentPrompt("")}
							>
								Reset to default
							</Button>
						)}
					</div>
					<p className="text-xs text-kumo-subtle mb-3">
						Customize how the built-in Email Agent behaves for this mailbox.
						Leave empty to use the built-in default prompt.
					</p>
					<textarea
						value={agentPrompt}
						onChange={(e) => setAgentPrompt(e.target.value)}
						placeholder={PROMPT_PLACEHOLDER}
						rows={12}
						className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring font-mono leading-relaxed"
					/>
				</div>

				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">
						AI Models
					</div>
					<p className="text-xs text-kumo-subtle mb-4">
						These models power the built-in Email Agent only. Grok Bot already
						uses Grok and talks to this inbox through MCP tools. Leave a field
						empty to use the Worker default.
					</p>
					<div className="space-y-3">
						<Input
							label="Agent"
							value={agentModel}
							onChange={(e) => setAgentModel(e.target.value)}
							placeholder={DEFAULT_AGENT_MODEL}
						/>
						<Input
							label="Prompt injection scan"
							value={injectionModel}
							onChange={(e) => setInjectionModel(e.target.value)}
							placeholder={DEFAULT_INJECTION_MODEL}
						/>
						<Input
							label="Draft verifier"
							value={verifierModel}
							onChange={(e) => setVerifierModel(e.target.value)}
							placeholder={DEFAULT_VERIFIER_MODEL}
						/>
					</div>
					<p className="text-xs text-kumo-subtle mt-3">
						Use a hosted Workers AI id (starts with @cf/) or a catalog id such as{" "}
						{EXAMPLE_GROK_MODEL}. Grok uses the same env.AI binding and AI Gateway
						credits. No xAI API key. Injection scan and draft verifier stay on
						hosted Workers AI. Deploy-wide defaults: AGENT_MODEL, INJECTION_MODEL,
						VERIFIER_MODEL.
					</p>
				</div>

				<div className="flex justify-end">
					<Button variant="primary" onClick={handleSave} loading={isSaving}>
						Save Changes
					</Button>
				</div>
			</div>
		</div>
	);
}
