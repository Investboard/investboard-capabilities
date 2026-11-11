/** Merging direct holdings and fund constituents into one position per security, with provenance. */
import { directHoldingClass } from "./asset-class.js";
import { classPartId, positionIdentity } from "./identity.js";
import type {
	DissolvedExposure,
	EngineDirectHolding,
	MergedPosition,
} from "./types.js";
function round2(v: number): number {
	return Math.round(v * 100) / 100;
}
function round4(v: number): number {
	return Number(v.toFixed(4));
}
export function mergeByIdentity(
	direct: EngineDirectHolding[],
	exposures: DissolvedExposure[],
	valuedTotal: number,
): MergedPosition[] {
	interface Acc {
		isin: string | null;
		ticker: string | null;
		name: string;
		value: number;
		assetClass: string;
		issuerScopeUncertain?: boolean;
		directValue: number;
		viaFunds: Map<
			string,
			{
				etf: string;
				id?: string;
				value: number;
				shareInEtf: number;
				name?: string;
			}
		>;
	}
	const { primary, ownLabel } = companyClasses(direct, exposures);
	const keyOf = (id: string, assetClass: string) =>
		primary.get(id) === assetClass ? id : classPartId(id, assetClass);
	const merged = new Map<string, Acc>();
	for (const h of direct) {
		const id = positionIdentity(h.isin, h.ticker);
		if (!id) continue;
		const assetClass = directHoldingClass(h.assetClass);
		const key = keyOf(id, assetClass);
		const existing = merged.get(key);
		if (existing) {
			existing.value += h.value;
			existing.directValue += h.value;
		} else {
			merged.set(key, {
				isin: h.isin?.trim().toUpperCase() ?? null,
				ticker: h.ticker.trim().toUpperCase(),
				name: h.name,
				value: h.value,
				assetClass,
				directValue: h.value,
				viaFunds: new Map(),
			});
		}
	}
	for (const e of exposures) {
		const sourceId = e.fundId ?? e.etf;
		const key = keyOf(e.id, e.assetClass);
		const existing = merged.get(key);
		if (existing) {
			existing.value += e.value;
			if (e.issuerScopeUncertain) existing.issuerScopeUncertain = true;
			const via = existing.viaFunds.get(sourceId);
			if (via) {
				via.value += e.value;
			} else {
				existing.viaFunds.set(sourceId, {
					etf: e.etf,
					id: e.fundId,
					value: e.value,
					name: e.fundName,
					shareInEtf: e.shareInEtf,
				});
			}
		} else {
			merged.set(key, {
				isin: e.isin,
				ticker: e.ticker,
				name: ownLabel.get(e.id) ?? e.name,
				value: e.value,
				assetClass: e.assetClass,
				...(e.issuerScopeUncertain ? { issuerScopeUncertain: true } : {}),
				directValue: 0,
				viaFunds: new Map([
					[
						sourceId,
						{
							etf: e.etf,
							id: e.fundId,
							value: e.value,
							shareInEtf: e.shareInEtf,
							name: e.fundName,
						},
					],
				]),
			});
		}
	}
	const safeTotal = valuedTotal > 0 ? valuedTotal : 0;
	return Array.from(merged.entries())
		.map(([id, a]) => ({
			id,
			isin: a.isin,
			ticker: a.ticker,
			name: a.name,
			value: round2(a.value),
			weight: safeTotal > 0 ? round4(a.value / safeTotal) : 0,
			assetClass: a.assetClass,
			...(a.issuerScopeUncertain ? { issuerScopeUncertain: true } : {}),
			sektor: null,
			region: null,
			provenance: {
				direct: safeTotal > 0 ? round4(a.directValue / safeTotal) : 0,
				directValue: a.directValue,
				viaFunds: Array.from(a.viaFunds.entries())
					.map(([, v]) => ({
						etf: v.etf,
						...(v.id ? { id: v.id } : {}),
						value: v.value,
						...(v.name ? { name: v.name } : {}),
						weight: safeTotal > 0 ? round4(v.value / safeTotal) : 0,
						shareInEtf: round4(v.shareInEtf),
					}))
					.sort((x, y) => y.weight - x.weight),
			},
		}))
		.sort((a, b) => b.weight - a.weight);
}
interface CompanyClasses {
	primary: Map<string, string>;
	ownLabel: Map<string, string>;
}
function companyClasses(
	direct: readonly EngineDirectHolding[],
	exposures: readonly DissolvedExposure[],
): CompanyClasses {
	const primary = new Map<string, string>();
	const ownLabel = new Map<string, string>();
	const mixed = new Set<string>();
	const eachLeg = (
		visit: (
			id: string,
			assetClass: string,
			value: number,
			own: boolean,
		) => void,
	) => {
		for (const h of direct) {
			const id = positionIdentity(h.isin, h.ticker);
			if (id) visit(id, directHoldingClass(h.assetClass), h.value, true);
		}
		for (const e of exposures) visit(e.id, e.assetClass, e.value, false);
	};
	for (const h of direct) {
		const id = positionIdentity(h.isin, h.ticker);
		if (id && !ownLabel.has(id)) ownLabel.set(id, h.name);
	}
	eachLeg((id, assetClass) => {
		const first = primary.get(id);
		if (first === undefined) primary.set(id, assetClass);
		else if (first !== assetClass) mixed.add(id);
	});
	if (mixed.size === 0) return { primary, ownLabel };
	const sums = new Map<
		string,
		{
			all: Map<string, number>;
			own: Map<string, number>;
		}
	>();
	eachLeg((id, assetClass, value, own) => {
		if (!mixed.has(id)) return;
		const s = sums.get(id) ?? { all: new Map(), own: new Map() };
		s.all.set(assetClass, (s.all.get(assetClass) ?? 0) + value);
		if (own) s.own.set(assetClass, (s.own.get(assetClass) ?? 0) + value);
		sums.set(id, s);
	});
	for (const [id, s] of sums) {
		const pick = s.all.has("equities")
			? "equities"
			: (heaviest(s.own) ?? heaviest(s.all));
		if (pick) primary.set(id, pick);
	}
	return { primary, ownLabel };
}
function heaviest(byClass: ReadonlyMap<string, number>): string | null {
	let best: string | null = null;
	let bestValue = Number.NEGATIVE_INFINITY;
	for (const [assetClass, value] of byClass) {
		if (
			value > bestValue ||
			(value === bestValue && best !== null && assetClass < best)
		) {
			best = assetClass;
			bestValue = value;
		}
	}
	return best;
}
