/** Fund-pair overlap: the weight two funds hold in common, security by security. */
import { mergeEtfInputsByFund } from "./fund-identity.js";
import { positionIdentity } from "./identity.js";
import type { EngineEtfInput, OverlapPairV2 } from "./types.js";
export const OVERLAP_NOISE_FLOOR = 0.01;
export const MAX_SHARED_HOLDINGS = 20;
function round4(v: number): number {
	return Number(v.toFixed(4));
}
interface ConstituentWeight {
	weight: number;
	name: string;
}
interface SharedName {
	id: string;
	name: string;
	weightInA: number;
	weightInB: number;
	common: number;
	combined: number;
}
interface EtfWeights {
	ticker: string;
	isin: string | null;
	map: Map<string, ConstituentWeight>;
}
function buildConstituentMap(
	etf: EngineEtfInput,
): Map<string, ConstituentWeight> {
	const map = new Map<string, ConstituentWeight>();
	for (const c of etf.constituents) {
		if (!(c.weight > 0)) continue;
		const id = positionIdentity(c.isin, c.identifier);
		if (!id) continue;
		const existing = map.get(id);
		if (existing) existing.weight += c.weight;
		else map.set(id, { weight: c.weight, name: c.name || c.identifier });
	}
	return map;
}
function compareSharedNames(x: SharedName, y: SharedName): number {
	if (y.common !== x.common) return y.common - x.common;
	if (y.combined !== x.combined) return y.combined - x.combined;
	return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
}
function buildPair(a: EtfWeights, b: EtfWeights): OverlapPairV2 | null {
	const shared: SharedName[] = [];
	let commonWeight = 0;
	for (const [id, wa] of a.map) {
		const wb = b.map.get(id);
		if (!wb) continue;
		const common = Math.min(wa.weight, wb.weight);
		commonWeight += common;
		shared.push({
			id,
			name: wa.name,
			weightInA: round4(wa.weight),
			weightInB: round4(wb.weight),
			common,
			combined: wa.weight + wb.weight,
		});
	}
	const clampedCommonWeight = Math.min(commonWeight, 1);
	if (clampedCommonWeight < OVERLAP_NOISE_FLOOR) return null;
	shared.sort(compareSharedNames);
	const top = shared.slice(0, MAX_SHARED_HOLDINGS);
	const rest = shared.slice(MAX_SHARED_HOLDINGS);
	let restWeight = 0;
	for (const h of rest) restWeight += h.common;
	return {
		etfA: a.ticker,
		etfB: b.ticker,
		isinA: a.isin,
		isinB: b.isin,
		overlapShare: round4(clampedCommonWeight),
		sharedCount: shared.length,
		sharedHoldings: top.map((h) => ({
			id: h.id,
			name: h.name,
			weightInA: h.weightInA,
			weightInB: h.weightInB,
		})),
		sharedTail:
			rest.length > 0
				? { count: rest.length, weight: round4(restWeight) }
				: null,
	};
}
export function detectOverlaps(etfs: EngineEtfInput[]): OverlapPairV2[] {
	const funds: EtfWeights[] = mergeEtfInputsByFund(etfs).map((etf) => ({
		ticker: etf.ticker,
		isin: etf.isin?.trim().toUpperCase() || null,
		map: buildConstituentMap(etf),
	}));
	const pairs: OverlapPairV2[] = [];
	for (let i = 0; i < funds.length; i++) {
		for (let j = i + 1; j < funds.length; j++) {
			const pair = buildPair(funds[i]!, funds[j]!);
			if (pair) pairs.push(pair);
		}
	}
	return pairs.sort((x, y) => y.overlapShare - x.overlapShare);
}
