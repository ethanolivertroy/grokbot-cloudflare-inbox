// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Loader, Tooltip } from "@cloudflare/kumo";
import { PlugsIcon, RobotIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useUIStore } from "~/hooks/useUIStore";
import { useMailboxTokens } from "~/queries/mailboxes";
import MCPPanel from "./MCPPanel";

function LazyAgentPanel() {
	const [AgentChat, setAgentChat] = useState<React.ComponentType | null>(
		null,
	);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		import("~/components/AgentPanel").then((mod) => {
			setAgentChat(() => mod.default);
		}).catch((err) => {
			console.error("Failed to load AgentPanel:", err);
			setLoadError("Failed to load agent panel");
		});
	}, []);

	if (loadError) {
		return (
			<div className="flex items-center justify-center h-full">
				<span className="text-xs text-kumo-error">{loadError}</span>
			</div>
		);
	}
	if (!AgentChat) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-2">
				<Loader size="base" />
				<span className="text-xs text-kumo-subtle">Loading agent...</span>
			</div>
		);
	}
	return <AgentChat />;
}

export default function AgentSidebar() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const { data: tokens = [], isFetched } = useMailboxTokens(mailboxId);
	const [userPicked, setUserPicked] = useState(false);
	const [activeTab, setActiveTab] = useState<"agent" | "mcp">("agent");

	useEffect(() => {
		if (userPicked || !isFetched) return;
		if (tokens.length === 0) setActiveTab("mcp");
	}, [isFetched, tokens.length, userPicked]);

	const toggleAgentPanel = useUIStore((state) => state.toggleAgentPanel);

	const selectTab = (tab: "agent" | "mcp") => {
		setUserPicked(true);
		setActiveTab(tab);
	};

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center border-b border-kumo-line shrink-0">
				<button
					type="button"
					onClick={() => selectTab("agent")}
					className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 bg-transparent cursor-pointer ${
						activeTab === "agent"
							? "border-kumo-brand text-kumo-default"
							: "border-transparent text-kumo-subtle hover:text-kumo-default"
					}`}
				>
					<RobotIcon size={14} weight={activeTab === "agent" ? "fill" : "regular"} />
					Agent
				</button>
				<button
					type="button"
					onClick={() => selectTab("mcp")}
					className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 bg-transparent cursor-pointer ${
						activeTab === "mcp"
							? "border-kumo-brand text-kumo-default"
							: "border-transparent text-kumo-subtle hover:text-kumo-default"
					}`}
				>
					<PlugsIcon size={14} weight={activeTab === "mcp" ? "fill" : "regular"} />
					Connect
				</button>
				<div className="ml-auto pr-1">
					<Tooltip content="Hide panel" asChild>
						<Button
							variant="ghost"
							shape="square"
							size="sm"
							icon={<XIcon size={14} />}
							onClick={toggleAgentPanel}
							aria-label="Hide agent and Connect"
						/>
					</Tooltip>
				</div>
			</div>

			<div className="flex-1 min-h-0 overflow-hidden">
				<div className={activeTab === "agent" ? "h-full" : "hidden"}>
					<LazyAgentPanel />
				</div>
				{activeTab === "mcp" && <MCPPanel />}
			</div>
		</div>
	);
}
