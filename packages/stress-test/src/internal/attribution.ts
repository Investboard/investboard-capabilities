import { isIsinShape } from "./identity.js";
import type { StressAttribution } from "./result-types.js";
import type { HoldingImpact } from "./result-types.js";
export function summarizeStressImpacts(
	impacts: readonly HoldingImpact[],
): StressAttribution | null {
	if (
		!impacts.length ||
		impacts.some(
			(row) =>
				!Number.isFinite(row.preStressValue) ||
				row.preStressValue < 0 ||
				!Number.isFinite(row.postStressValue),
		)
	)
		return null;
	const preStressValueCents = Math.round(
		impacts.reduce((sum, row) => sum + row.preStressValue, 0) * 100,
	);
	if (preStressValueCents <= 0) return null;
	const postStressValueCents = Math.round(
		impacts.reduce((sum, row) => sum + row.postStressValue, 0) * 100,
	);
	const netImpactCents = postStressValueCents - preStressValueCents;
	const groups = new Map<
		string,
		{
			holdingId: string;
			name: string;
			impact: number;
			shockSource: HoldingImpact["shockSource"];
			holdingCount: number;
		}
	>();
	for (const row of impacts) {
		const isin = row.isin?.trim().toUpperCase();
		const key =
			isin && isIsinShape(isin)
				? `isin:${isin}:${row.shockSource}`
				: `holding:${row.holdingId}`;
		const group = groups.get(key);
		const impact = row.postStressValue - row.preStressValue;
		if (group) {
			group.impact += impact;
			group.holdingCount += 1;
			if (row.holdingId.localeCompare(group.holdingId) < 0) {
				group.holdingId = row.holdingId;
				group.name = row.name;
			}
		} else
			groups.set(key, {
				holdingId: row.holdingId,
				name: row.name,
				impact,
				shockSource: row.shockSource,
				holdingCount: 1,
			});
	}
	const lossDrivers = [...groups.values()]
		.map(({ impact, holdingCount, ...row }) => ({
			...row,
			impactCents: Math.round(impact * 100),
			...(holdingCount > 1 ? { holdingCount } : {}),
		}))
		.filter((row) => row.impactCents < 0)
		.sort(
			(a, b) =>
				a.impactCents - b.impactCents || a.holdingId.localeCompare(b.holdingId),
		)
		.slice(0, 3)
		.map((row) => ({
			...row,
			portfolioImpactFraction: row.impactCents / preStressValueCents,
		}));
	const historicalValue = impacts.reduce(
		(sum, row) =>
			row.shockSource === "historical_price" ? sum + row.preStressValue : sum,
		0,
	);
	return {
		preStressValueCents,
		postStressValueCents,
		netImpactCents,
		lossDrivers,
		otherImpactCents:
			netImpactCents -
			lossDrivers.reduce((sum, row) => sum + row.impactCents, 0),
		historicalValueFraction: Math.min(
			1,
			(historicalValue * 100) / preStressValueCents,
		),
	};
}
