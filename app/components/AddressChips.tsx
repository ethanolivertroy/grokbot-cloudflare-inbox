// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export default function AddressChips({ addresses }: { addresses: string[] }) {
	if (addresses.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-1 mt-1.5">
			{addresses.map((address) => (
				<span
					key={address}
					title={address}
					className="inline-flex max-w-full items-center rounded-md bg-kumo-fill px-1.5 py-0.5 text-[11px] leading-4 text-kumo-strong truncate"
				>
					{address}
				</span>
			))}
		</div>
	);
}
