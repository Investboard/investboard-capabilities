/** Merging direct holdings and fund constituents into one position per security, with provenance. */
import { normalizeAssetClass, UNKNOWN_ASSET_CLASS } from "./asset-class.js";
import { positionIdentity } from "./identity.js";
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
	const merged = new Map<string, Acc>();
	for (const h of direct) {
		const id = positionIdentity(h.isin, h.ticker);
		if (!id) continue;
		const existing = merged.get(id);
		if (existing) {
			existing.value += h.value;
			existing.directValue += h.value;
		} else {
			merged.set(id, {
				isin: h.isin?.trim().toUpperCase() ?? null,
				ticker: h.ticker.trim().toUpperCase(),
				name: h.name,
				value: h.value,
				assetClass:
					h.assetClass === UNKNOWN_ASSET_CLASS
						? h.assetClass
						: normalizeAssetClass(h.assetClass),
				directValue: h.value,
				viaFunds: new Map(),
			});
		}
	}
	for (const e of exposures) {
		const sourceId = e.fundId ?? e.etf;
		const existing = merged.get(e.id);
		if (existing) {
			existing.value += e.value;
			if (existing.directValue === 0 && e.assetClass === "equities") {
				existing.assetClass = "equities";
			}
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
			merged.set(e.id, {
				isin: e.isin,
				ticker: e.ticker,
				name: e.name,
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
