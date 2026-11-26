import { AmountSum } from "../precision.js";
import { positionIdentity } from "./identity.js";

export interface DisclosedConstituent {
	isin?: string | null;
	identifier?: string;
	name?: string;
	weight: number;
}

interface WeightedConstituent {
	id: string;
	isin: string | null;
	ticker: string | null;
	name: string;
	weight: number;
}

/** Effective weights for one disclosed long-only fund. Partial lists retain their missing mass. */
export function constituentWeights(
	constituents: readonly DisclosedConstituent[],
) {
	const groups = new Map<
		string,
		{
			isin: string | null;
			symbol: string | null;
			conflictingSymbols: boolean;
			reportedName: string | null;
			weight: AmountSum;
		}
	>();
	const coveredWeights = new AmountSum();
	for (const c of constituents) {
		if (!Number.isFinite(c.weight) || c.weight <= 0) continue;
		const id = positionIdentity(c.isin, c.identifier);
		if (!id) continue;
		const weight = Math.min(c.weight, 1);
		coveredWeights.add(weight);
		const isin = c.isin?.trim().toUpperCase() ?? null;
		let group = groups.get(id);
		if (!group) {
			group = {
				isin,
				symbol: null,
				conflictingSymbols: false,
				reportedName: null,
				weight: new AmountSum(),
			};
			groups.set(id, group);
		}
		group.isin ??= isin;
		group.weight.add(weight);

		// A blank symbol adds no evidence. Different nonblank symbols for one
		// ISIN still describe one exposure, but cannot select a provider listing.
		const symbol = c.identifier?.trim();
		if (symbol) {
			if (group.symbol && group.symbol.toUpperCase() !== symbol.toUpperCase()) {
				group.conflictingSymbols = true;
			} else if (!group.symbol || symbol < group.symbol) {
				group.symbol = symbol;
			}
		}
		const name = c.name?.trim();
		if (
			name &&
			name.toUpperCase() !== isin &&
			name.toUpperCase() !== symbol?.toUpperCase()
		) {
			if (!group.reportedName || name < group.reportedName)
				group.reportedName = name;
		}
	}

	const rawCovered = coveredWeights.value;
	const scale = rawCovered > 1 ? 1 / rawCovered : 1;
	const entries = new Map<string, WeightedConstituent>();
	for (const [id, group] of groups) {
		const symbol = group.conflictingSymbols ? null : group.symbol;
		entries.set(id, {
			id,
			isin: group.isin,
			ticker: symbol?.toUpperCase() ?? null,
			name: group.reportedName ?? symbol ?? group.isin ?? id,
			weight: group.weight.value * scale,
		});
	}
	return { entries, covered: Math.min(rawCovered, 1) };
}
