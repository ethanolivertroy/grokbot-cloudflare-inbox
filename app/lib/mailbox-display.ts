// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { Mailbox } from "~/types";

export function mailboxAliases(
	mailbox?: Pick<Mailbox, "aliases" | "settings"> | null,
): string[] {
	return mailbox?.aliases ?? mailbox?.settings?.aliases ?? [];
}

export function mailboxDisplayName(
	mailbox?: Pick<Mailbox, "name" | "email" | "settings"> | null,
	fallback?: string,
): string {
	if (!mailbox) return fallback || "Mailbox";
	if (mailbox.settings?.fromName) return mailbox.settings.fromName;
	if (mailbox.name && mailbox.name !== mailbox.email) return mailbox.name;
	return mailbox.email.split("@")[0] || mailbox.name || fallback || "Mailbox";
}
