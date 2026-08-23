// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Select, Tooltip, useKumoToastManager } from "@cloudflare/kumo";
import {
	CheckIcon,
	CopyIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { mailboxAliases } from "~/lib/mailbox-display";
import type { CreatedMailboxToken } from "~/services/api";
import {
	useCreateMailboxToken,
	useMailbox,
	useMailboxTokens,
	useRevokeMailboxToken,
} from "~/queries/mailboxes";

function CopyButton({ text, label }: { text: string; label?: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard API unavailable or permission denied
		}
	};

	return (
		<Tooltip content={copied ? "Copied" : (label ?? "Copy")} asChild>
			<Button
				variant="ghost"
				shape="square"
				size="sm"
				icon={
					copied ? (
						<CheckIcon size={12} weight="bold" className="text-kumo-success" />
					) : (
						<CopyIcon size={12} />
					)
				}
				onClick={handleCopy}
				aria-label={label ?? "Copy to clipboard"}
			/>
		</Tooltip>
	);
}

function grokBotConfig(mcpUrl: string, token: string): string {
	return JSON.stringify(
		{
			url: mcpUrl,
			headers: {
				Authorization: `Bearer ${token}`,
			},
		},
		null,
		2,
	);
}

function CopyRow({
	label,
	value,
	copyLabel,
	mono = true,
}: {
	label: string;
	value: string;
	copyLabel: string;
	mono?: boolean;
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between gap-2">
				<label className="text-xs font-medium text-kumo-strong">{label}</label>
				<CopyButton text={value} label={copyLabel} />
			</div>
			<div
				className={`bg-kumo-recessed text-kumo-default text-[12px] px-3 py-2 rounded-md border border-kumo-line break-all leading-relaxed ${
					mono ? "font-mono" : ""
				}`}
			>
				{value}
			</div>
		</div>
	);
}

export default function MCPPanel() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toastManager = useKumoToastManager();
	const baseUrl =
		typeof window !== "undefined" ? window.location.origin : "https://your-app.workers.dev";
	const mcpUrl = `${baseUrl}/mcp`;

	const { data: mailbox } = useMailbox(mailboxId);
	const { data: tokens = [], isFetched } = useMailboxTokens(mailboxId);
	const createToken = useCreateMailboxToken();
	const revokeToken = useRevokeMailboxToken();
	const [freshToken, setFreshToken] = useState<CreatedMailboxToken | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const [fromAddress, setFromAddress] = useState(mailboxId ?? "");
	const [showConfig, setShowConfig] = useState(false);
	const aliases = mailboxAliases(mailbox);
	const sendAsOptions = mailboxId
		? [mailboxId, ...aliases.filter((alias) => alias !== mailboxId)]
		: [];

	useEffect(() => {
		if (mailboxId && !fromAddress) setFromAddress(mailboxId);
	}, [mailboxId, fromAddress]);

	const handleCreate = async () => {
		if (!mailboxId) return;
		setIsCreating(true);
		try {
			const created = await createToken.mutateAsync({
				mailboxId,
				fromAddress: fromAddress || mailboxId,
			});
			setFreshToken(created);
			setShowConfig(false);
		} catch (e) {
			toastManager.add({
				title: e instanceof Error ? e.message : "Could not create token",
				variant: "error",
			});
		} finally {
			setIsCreating(false);
		}
	};

	const handleRevoke = async (tokenId: string) => {
		if (!mailboxId) return;
		try {
			await revokeToken.mutateAsync({ mailboxId, tokenId });
			if (freshToken?.id === tokenId) setFreshToken(null);
			toastManager.add({ title: "Token revoked" });
		} catch {
			toastManager.add({ title: "Could not revoke token", variant: "error" });
		}
	};

	const configText = freshToken
		? grokBotConfig(freshToken.mcpUrl || mcpUrl, freshToken.token)
		: "";

	return (
		<div className="flex flex-col h-full">
			<div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
				<div className="space-y-1">
					<h3 className="text-sm font-semibold text-kumo-default">
						Connect Grok Bot
					</h3>
					<p className="text-sm text-kumo-subtle leading-relaxed">
						Create a token, paste it into Grok Bot as an MCP server.
						Same inbox for every agent. You do not pass a mailbox id.
					</p>
				</div>

				<CopyRow label="Server URL" value={mcpUrl} copyLabel="Copy URL" />

				{sendAsOptions.length > 1 ? (
					<div className="space-y-1.5">
						<label className="text-xs font-medium text-kumo-strong block">
							Send as
						</label>
						<Select
							aria-label="Send as address"
							value={fromAddress || mailboxId}
							onValueChange={(value) => {
								if (value) setFromAddress(value);
							}}
						>
							{sendAsOptions.map((address) => (
								<Select.Option key={address} value={address}>
									{address}
									{address === mailboxId ? " · inbox" : ""}
								</Select.Option>
							))}
						</Select>
						<p className="text-xs text-kumo-subtle leading-relaxed">
							This token still reads the whole inbox.
						</p>
					</div>
				) : (
					<p className="text-xs text-kumo-subtle leading-relaxed">
						One shared From address.{" "}
						<Link
							to={`/mailbox/${mailboxId}/settings`}
							className="text-kumo-strong underline-offset-2 hover:underline"
						>
							Add aliases
						</Link>{" "}
						if each bot should send as itself.
					</p>
				)}

				<Button
					onClick={handleCreate}
					disabled={isCreating || !mailboxId}
					className="w-full"
				>
					{isCreating ? "Creating…" : "Create token"}
				</Button>

				{freshToken && (
					<div className="rounded-md border border-kumo-line bg-kumo-recessed p-3 space-y-3">
						<div className="space-y-0.5">
							<p className="text-xs font-medium text-kumo-default">
								Shown once
							</p>
							<p className="text-xs text-kumo-subtle">
								{freshToken.fromAddress
									? `Sends as ${freshToken.fromAddress}.`
									: "Copy it now."}
							</p>
						</div>
						<CopyRow
							label="Token"
							value={freshToken.token}
							copyLabel="Copy token"
						/>
						<div className="flex items-center gap-2">
							<Button
								size="sm"
								variant="secondary"
								onClick={async () => {
									try {
										await navigator.clipboard.writeText(configText);
										toastManager.add({ title: "Config copied" });
									} catch {
										toastManager.add({
											title: "Could not copy config",
											variant: "error",
										});
									}
								}}
							>
								Copy MCP config
							</Button>
							<button
								type="button"
								onClick={() => setShowConfig((open) => !open)}
								className="text-xs text-kumo-strong bg-transparent border-0 p-0 cursor-pointer hover:underline underline-offset-2"
							>
								{showConfig ? "Hide" : "Show"} JSON
							</button>
						</div>
						{showConfig && (
							<pre className="bg-kumo-base text-kumo-default font-mono text-[11px] px-3 py-2.5 rounded-md border border-kumo-line overflow-x-auto leading-relaxed whitespace-pre">
								{configText}
							</pre>
						)}
					</div>
				)}

				{isFetched && tokens.length > 0 && (
					<div className="space-y-2">
						<div className="text-xs font-medium text-kumo-strong">
							Active tokens
						</div>
						<div className="border border-kumo-line rounded-md divide-y divide-kumo-line">
							{tokens.map((token) => (
								<div
									key={token.id}
									className="flex items-center gap-2 px-3 py-2.5"
								>
									<div className="min-w-0 flex-1">
										<div className="text-xs text-kumo-default truncate">
											{token.fromAddress || mailboxId}
										</div>
										<div className="text-[11px] text-kumo-subtle font-mono truncate">
											{token.prefix}…
										</div>
									</div>
									<Tooltip content="Revoke" asChild>
										<Button
											variant="ghost"
											shape="square"
											size="sm"
											icon={<TrashIcon size={12} />}
											aria-label="Revoke token"
											onClick={() => handleRevoke(token.id)}
										/>
									</Tooltip>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
