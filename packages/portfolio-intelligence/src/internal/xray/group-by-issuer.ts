/** Grouping positions by company: share classes, receipts and bonds of one issuer together. */
import { foldCompanyParts } from "./company-fold.js";
import { isResidualId } from "./identity.js";
import { canonicalIssuerIdentities } from "./issuer-identities.js";
import type { IssuerGroup, MergedPosition } from "./types.js";
function round2(v: number): number {
	return Math.round(v * 100) / 100;
}
function round4(v: number): number {
	return Number(v.toFixed(4));
}
export function groupByIssuer(merged: MergedPosition[]): IssuerGroup[] {
	const positions = foldCompanyParts(merged);
	interface Acc {
		key: string;
		name: string;
		value: number;
		weight: number;
		members: MergedPosition[];
	}
	const groups = new Map<string, Acc>();
	const identities = canonicalIssuerIdentities(positions);
	for (const [index, p] of positions.entries()) {
		if (isResidualId(p.id)) continue;
		const key = identities.keys[index] ?? p.id;
		const existing = groups.get(key);
		if (existing) {
			existing.value += p.value;
			existing.weight += p.weight;
			existing.members.push(p);
		} else {
			groups.set(key, {
				key,
				name: p.name,
				value: p.value,
				weight: p.weight,
				members: [p],
			});
		}
	}
	return Array.from(groups.values())
		.map((g) => {
			const breakdown = [...g.members].sort((a, b) => b.weight - a.weight);
			const leader = breakdown[0] ?? g.members[0];
			return {
				key: g.key,
				name: leader?.name ?? g.name,
				value: round2(g.value),
				weight: round4(g.weight),
				grouped: breakdown.length > 1,
				breakdown,
			};
		})
		.sort((a, b) => b.weight - a.weight);
}
