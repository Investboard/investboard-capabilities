/** Grouping positions into weighted buckets (asset class, listing currency) with their largest contributors. */
import { directHoldingClass } from "./asset-class.js";
import { fundAssetClass } from "./dissolve.js";
import { positionIdentity } from "./identity.js";
import type { EngineDirectHolding, EngineEtfInput } from "./types.js";
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
			const bucketWeight = valuedTotal > 0 ? g.value / valuedTotal : 0;
			return {
				key,
				weight: bucketWeight,
				value: g.value,
				contributors: top,
				contributorsTail:
					rest.length > 0
						? {
								count: rest.length,
								weight: rest.reduce((sum, row) => sum + row.weight, 0),
							}
						: null,
			};
		})
		.sort((a, b) => b.weight - a.weight);
}
export function holdingAssetClassBuckets(
	direct: readonly EngineDirectHolding[],
	funds: readonly EngineEtfInput[],
	valuedTotal: number,
): {
	coverage: number;
	buckets: DimensionBucket[];
} {
	const groups = new Map<
		string,
		{
			value: number;
			byId: Map<
				string,
				BucketContributor & {
					value: number;
				}
			>;
		}
	>();
	const add = (
		key: string,
		id: string,
		name: string,
		isin: string | null,
		value: number,
	) => {
		const g = groups.get(key) ?? { value: 0, byId: new Map() };
		g.value += value;
		const c = g.byId.get(id);
		if (c) c.value += value;
		else g.byId.set(id, { id, label: name, isin, weight: 0, value });
		groups.set(key, g);
	};
	for (const h of direct) {
		add(
			directHoldingClass(h.assetClass),
			positionIdentity(h.isin, h.ticker) ?? `ticker:${h.ticker}`,
			h.name,
			h.isin,
			h.value,
		);
	}
	for (const f of funds) {
		add(
			fundAssetClass(f),
			positionIdentity(f.isin, f.ticker) ?? `ticker:${f.ticker}`,
			f.name,
			f.isin,
			f.value,
		);
	}
	const finalGroups = new Map<
		string,
		{
			value: number;
			contributors: BucketContributor[];
		}
	>();
	for (const [key, g] of groups) {
		finalGroups.set(key, {
			value: g.value,
			contributors: Array.from(g.byId.values()).map(({ value, ...c }) => ({
				...c,
				weight: valuedTotal > 0 ? value / valuedTotal : 0,
			})),
		});
	}
	return { coverage: 1, buckets: finalize(finalGroups, valuedTotal) };
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
			weight: valuedTotal > 0 ? r.value / valuedTotal : 0,
		});
		groups.set(key, g);
	}
	return { coverage: 1, buckets: finalize(groups, valuedTotal) };
}
