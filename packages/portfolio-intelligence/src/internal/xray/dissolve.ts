import { constituentWeights } from "./constituent-weights.js";
/** Dissolving funds into constituent positions plus a residual for the part not covered. Equity funds only. */
import {
	isNeverLookedThroughClass,
	normalizeAssetClass,
} from "./asset-class.js";
import { fundIdentity } from "./fund-key.js";
import { RESIDUAL_ID_PREFIX } from "./identity.js";
import type {
	DissolvedExposure,
	EngineEtfInput,
	EtfDissolution,
} from "./types.js";
export function heldWholeIfNeverLookedThrough(
	etf: EngineEtfInput,
): EngineEtfInput {
	const policy = etf.heldWholeAs ? { assetClass: etf.heldWholeAs } : null;
	if (!policy && !isNeverLookedThroughClass(etf.underlyingAssetClass))
		return etf;
	const alreadySealed =
		(!policy || etf.underlyingAssetClass === policy.assetClass) &&
		etf.constituents.length === 0 &&
		etf.sectorVector == null &&
		etf.countryVector == null &&
		etf.industryVector == null;
	if (alreadySealed) return etf;
	return {
		...etf,
		underlyingAssetClass: policy?.assetClass ?? etf.underlyingAssetClass,
		constituents: [],
		sectorVector: null,
		countryVector: null,
		industryVector: null,
	};
}
export function holdNeverLookedThroughFundsWhole(
	etfs: readonly EngineEtfInput[],
): EngineEtfInput[] {
	return etfs.map(heldWholeIfNeverLookedThrough);
}
export function fundAssetClass(etf: EngineEtfInput): string {
	const held = heldWholeIfNeverLookedThrough(etf);
	return held.underlyingAssetClass
		? normalizeAssetClass(held.underlyingAssetClass)
		: "equities";
}
type FundClassOnly = Pick<EngineEtfInput, "underlyingAssetClass"> &
	Partial<Pick<EngineEtfInput, "isin" | "heldWholeAs">>;
export function canBeLookedThrough(fund: FundClassOnly): boolean {
	return (
		!fund.heldWholeAs && !isNeverLookedThroughClass(fund.underlyingAssetClass)
	);
}
export function lookThroughFundCount(etfs: readonly FundClassOnly[]): number {
	let count = 0;
	for (const etf of etfs) if (canBeLookedThrough(etf)) count++;
	return count;
}
export interface DissolutionTally {
	full: number;
	partial: number;
	none: number;
}
export function lookThroughDissolutionTally(
	etfInputs: readonly FundClassOnly[],
	dissolutions: readonly Pick<EtfDissolution, "status">[],
): DissolutionTally {
	const tally: DissolutionTally = { full: 0, partial: 0, none: 0 };
	for (let i = 0; i < etfInputs.length; i++) {
		const etf = etfInputs[i];
		const d = dissolutions[i];
		if (!etf || !d || !canBeLookedThrough(etf)) continue;
		tally[d.status]++;
	}
	return tally;
}
export const FULL_DISSOLUTION_THRESHOLD = 0.98;
export function dissolveEtfs(etfs: EngineEtfInput[]): {
	exposures: DissolvedExposure[];
	dissolutions: EtfDissolution[];
} {
	const exposures: DissolvedExposure[] = [];
	const dissolutions: EtfDissolution[] = [];
	// Keep existing residual IDs for unique tickers. Distinct funds can share a ticker.
	const fundByTicker = new Map<string, string>();
	const ambiguousTickers = new Set<string>();
	for (const etf of etfs) {
		const ticker = etf.ticker.trim().toUpperCase();
		const id = fundIdentity(etf) ?? ticker;
		if (fundByTicker.has(ticker) && fundByTicker.get(ticker) !== id)
			ambiguousTickers.add(ticker);
		fundByTicker.set(ticker, id);
	}
	for (const etf of holdNeverLookedThroughFundsWhole(etfs)) {
		const constituentClass = fundAssetClass(etf);
		const { entries, covered } = constituentWeights(etf.constituents);
		const ticker = etf.ticker.trim().toUpperCase();
		const fundId = fundIdentity(etf) ?? undefined;
		for (const v of entries.values()) {
			const w = v.weight;
			exposures.push({
				id: v.id,
				isin: v.isin,
				ticker: v.ticker,
				name: v.name,
				value: etf.value * w,
				assetClass: constituentClass,
				fundId,
				etf: etf.ticker,
				fundName: etf.name,
				shareInEtf: w,
				residual: false,
			});
		}
		const status: EtfDissolution["status"] =
			covered === 0
				? "none"
				: covered >= FULL_DISSOLUTION_THRESHOLD
					? "full"
					: "partial";
		const uncoveredValue = etf.value * (1 - covered);
		if (uncoveredValue > 0) {
			const residualKey = ambiguousTickers.has(ticker)
				? (fundId ?? ticker)
				: ticker;
			exposures.push({
				id: `${RESIDUAL_ID_PREFIX}${residualKey}`,
				isin: null,
				ticker: null,
				name: etf.name,
				value: uncoveredValue,
				assetClass: constituentClass,
				fundId,
				etf: etf.ticker,
				fundName: etf.name,
				shareInEtf: 1 - covered,
				residual: true,
				...(etf.degraded ? { issuerScopeUncertain: true } : {}),
			});
		}
		dissolutions.push({
			ticker: etf.ticker,
			name: etf.name,
			status,
			coveredWeight: covered,
			degraded: etf.degraded ?? false,
			...(etf.indexRead ? { indexRead: etf.indexRead } : {}),
			asOf: etf.asOf,
		});
	}
	return { exposures, dissolutions };
}
export function bookAsOf(
	dissolutions: readonly Pick<EtfDissolution, "asOf">[],
): string | null {
	let oldest: string | null = null;
	for (const d of dissolutions) {
		if (!d.asOf || !ISO_CALENDAR_DATE.test(d.asOf)) continue;
		if (oldest === null || d.asOf < oldest) oldest = d.asOf;
	}
	return oldest;
}
const ISO_CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}(?:$|[T ])/;
