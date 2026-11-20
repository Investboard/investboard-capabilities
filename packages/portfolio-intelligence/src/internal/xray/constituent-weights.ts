import { AmountSum } from "../precision.js";
import { positionIdentity } from "./identity.js";
import type { EngineEtfInput } from "./types.js";

/** Effective weights for one disclosed long-only fund. Partial lists retain their missing mass. */
export function constituentWeights(
	constituents: EngineEtfInput["constituents"],
) {
	const entries = new Map<
		string,
		{
			id: string;
			isin: string | null;
			ticker: string | null;
			name: string;
			weight: number;
		}
	>();
	const coveredWeights = new AmountSum();
	for (const c of constituents) {
		if (!(c.weight > 0)) continue;
		const id = positionIdentity(c.isin, c.identifier);
		if (!id) continue;
		const weight = Math.min(c.weight, 1);
		coveredWeights.add(weight);
		const existing = entries.get(id);
		if (existing) {
			existing.weight += weight;
			continue;
		}
		entries.set(id, {
			id,
			isin: c.isin?.trim().toUpperCase() ?? null,
			ticker: c.identifier?.trim().toUpperCase() || null,
			name: c.name || c.identifier,
			weight,
		});
	}
	const rawCovered = coveredWeights.value;
	if (rawCovered > 1) {
		const scale = 1 / rawCovered;
		for (const entry of entries.values()) entry.weight *= scale;
	}
	return { entries, covered: Math.min(rawCovered, 1) };
}
