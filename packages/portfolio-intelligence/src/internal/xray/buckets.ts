/** Grouping positions into weighted buckets (asset class, listing currency) with their largest contributors. */
import type { MergedPosition } from "./types.js";
const CONTRIBUTORS_CAP = 5;
export interface BucketContributor {
	id: string;
	label: string;
	isin: string | null;
	weight: number;
}
export interface DimensionBucket {
	key: string;
	weight: number;
	value: number;
	contributors: BucketContributor[];
	contributorsTail: {
		count: number;
		weight: number;
	} | null;
}
function round2(v: number): number {
	return Math.round(v * 100) / 100;
}
function round4(v: number): number {
	return Number(v.toFixed(4));
}
export function finalizeDimensionBuckets(
	groups: Map<
		string,
		{
			value: number;
			contributors: BucketContributor[];
		}
	>,
	valuedTotal: number,
): DimensionBucket[] {
	return finalize(groups, valuedTotal);
}
function finalize(
	groups: Map<
		string,
		{
			value: number;
			contributors: BucketContributor[];
		}
	>,
	valuedTotal: number,
): DimensionBucket[] {
	return Array.from(groups.entries())
		.map(([key, g]) => {
			const sorted = g.contributors.sort((a, b) => b.weight - a.weight);
			const top = sorted.slice(0, CONTRIBUTORS_CAP);
			const rest = sorted.slice(CONTRIBUTORS_CAP);
			const bucketWeight = valuedTotal > 0 ? round4(g.value / valuedTotal) : 0;
			const topWeightSum = top.reduce((s, c) => s + c.weight, 0);
			return {
				key,
				weight: bucketWeight,
				value: round2(g.value),
				contributors: top,
				contributorsTail:
					rest.length > 0
						? {
								count: rest.length,
								weight: round4(Math.max(0, bucketWeight - topWeightSum)),
							}
						: null,
			};
		})
		.sort((a, b) => b.weight - a.weight);
}
export function assetClassBuckets(
	merged: MergedPosition[],
	valuedTotal: number,
): {
	coverage: number;
	buckets: DimensionBucket[];
} {
	const groups = new Map<
		string,
		{
			value: number;
			contributors: BucketContributor[];
		}
	>();
	for (const p of merged) {
		const g = groups.get(p.assetClass) ?? { value: 0, contributors: [] };
		g.value += p.value;
		g.contributors.push({
			id: p.id,
			label: p.name,
			isin: p.isin,
			weight: p.weight,
		});
		groups.set(p.assetClass, g);
	}
	return { coverage: 1, buckets: finalize(groups, valuedTotal) };
}
export interface CurrencyBucketInput {
	id: string;
	name: string;
	isin: string | null;
	currency: string;
	value: number;
}
export function currencyBuckets(
	rows: CurrencyBucketInput[],
	valuedTotal: number,
): {
	coverage: number;
	buckets: DimensionBucket[];
} {
	const groups = new Map<
		string,
		{
			value: number;
			contributors: BucketContributor[];
		}
	>();
	for (const r of rows) {
		const key = r.currency.toUpperCase();
		const g = groups.get(key) ?? { value: 0, contributors: [] };
		g.value += r.value;
		g.contributors.push({
			id: r.id,
			label: r.name,
			isin: r.isin,
			weight: valuedTotal > 0 ? Number((r.value / valuedTotal).toFixed(4)) : 0,
		});
		groups.set(key, g);
	}
	return { coverage: 1, buckets: finalize(groups, valuedTotal) };
}
