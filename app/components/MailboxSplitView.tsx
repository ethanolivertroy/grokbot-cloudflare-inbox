// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { ReactNode } from "react";
import ComposePanel from "~/components/ComposePanel";
import EmailPanel from "~/components/EmailPanel";
import { useUIStore } from "~/hooks/useUIStore";

interface MailboxSplitViewProps {
	selectedEmailId: string | null;
	isComposing: boolean;
	children: ReactNode;
}

export default function MailboxSplitView({
	selectedEmailId,
	isComposing,
	children,
}: MailboxSplitViewProps) {
	const isPanelOpen = selectedEmailId !== null || isComposing;
	const isAgentPanelOpen = useUIStore((state) => state.isAgentPanelOpen);
	const listWidth = isAgentPanelOpen
		? "hidden md:flex md:w-[220px] lg:w-[240px] xl:w-[280px]"
		: "hidden md:flex md:w-[280px] lg:w-[300px] xl:w-[340px]";

	return (
		<div className="flex h-full min-w-0">
			<div
				className={`flex flex-col min-w-0 ${
					isPanelOpen
						? `${listWidth} shrink-0 md:border-r md:border-kumo-line`
						: "w-full"
				}`}
			>
				{children}
			</div>
			{isPanelOpen && (
				<div className="flex-1 flex flex-col min-w-0 overflow-hidden w-full md:min-w-[20rem]">
					{isComposing && !selectedEmailId ? (
						<ComposePanel />
					) : isComposing && selectedEmailId ? (
						<div className="flex flex-col h-full overflow-y-auto">
							<ComposePanel />
							<div className="border-t border-kumo-line">
								<EmailPanel emailId={selectedEmailId} />
							</div>
						</div>
					) : selectedEmailId ? (
						<EmailPanel emailId={selectedEmailId} />
					) : null}
				</div>
			)}
		</div>
	);
}
