/** Grouping positions by company: share classes, receipts and bonds of one issuer together. */
import { foldCompanyParts } from "./company-fold.js";
import { companyIdOf, isResidualId } from "./identity.js";
import { canonicalIssuerIdentities } from "./issuer-identities.js";
import type { IssuerGroup, MergedPosition } from "./types.js";
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
	const rowIds = new Map<string, string[]>();
	for (const row of merged) {
		const company = companyIdOf(row.id);
		const ids = rowIds.get(company);
		if (ids) ids.push(row.id);
		else rowIds.set(company, [row.id]);
	}
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
				name: leader?.issuerIdentity?.verifiedName ?? leader?.name ?? g.name,
				value: g.value,
				weight: g.weight,
				grouped: breakdown.length > 1,
				positionIds: breakdown.flatMap(
					(p) => rowIds.get(companyIdOf(p.id)) ?? [],
				),
				breakdown,
			};
		})
		.sort((a, b) => b.weight - a.weight);
}
