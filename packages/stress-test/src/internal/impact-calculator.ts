import { isIsinShape } from "./identity.js";
import type { HoldingImpact } from "./result-types.js";
import type { CrisisDefinition } from "./scenarios/crisis-definitions.js";
import { resolveStressTestSector } from "./scenarios/sector-enum.js";
import { ASSET_CLASS_SHOCK_PROXY, applyShock } from "./shock-applicator.js";
import type { StressHoldingInput } from "./types.js";
export interface PortfolioImpactResult {
	holdingImpacts: HoldingImpact[];
	preStressTotal: number;
	postStressTotal: number;
	absoluteLoss: number;
	percentageLoss: number;
}
export function computePortfolioImpact(
	holdings: StressHoldingInput[],
	crisis: CrisisDefinition,
	baseCurrency: string = "EUR",
	standIns: ReadonlyMap<string, string> = ASSET_CLASS_SHOCK_PROXY,
): PortfolioImpactResult {
	if (holdings.length === 0) {
		return {
			holdingImpacts: [],
			preStressTotal: 0,
			postStressTotal: 0,
			absoluteLoss: 0,
			percentageLoss: 0,
		};
	}
	const holdingImpacts: HoldingImpact[] = holdings.map((holding) => {
		const isin = holding.isin?.trim().toUpperCase();
		const shockResult = applyShock(holding, crisis, baseCurrency, standIns);
		const resolvedSector = resolveStressTestSector(
			holding.sector,
			holding.assetClass,
		);
		return {
			holdingId: holding.holdingId,
			...(isin && isIsinShape(isin) ? { isin } : {}),
			ticker: holding.ticker,
			name: holding.name,
			sector: resolvedSector,
			assetClass: holding.assetClass,
			preStressValue: holding.currentValue,
			postStressValue: shockResult.postStressValue,
			absoluteLoss: shockResult.absoluteLoss,
			percentageLoss: shockResult.percentageLoss,
			shockApplied: shockResult.shockApplied,
			shockSource: shockResult.shockSource,
			betaAdjusted: shockResult.betaAdjusted,
			fxShockApplied: shockResult.fxShockApplied,
			currencyMethod: shockResult.currencyMethod,
		};
	});
	const preStressTotal =
		Math.round(holdings.reduce((sum, h) => sum + h.currentValue, 0) * 100) /
		100;
	const postStressTotal =
		Math.round(
			holdingImpacts.reduce((sum, h) => sum + h.postStressValue, 0) * 100,
		) / 100;
	const absoluteLoss =
		Math.round((postStressTotal - preStressTotal) * 100) / 100;
	const percentageLoss =
		preStressTotal > 0
			? Math.round((absoluteLoss / preStressTotal) * 10000) / 10000
			: 0;
	return {
		holdingImpacts,
		preStressTotal,
		postStressTotal,
		absoluteLoss,
		percentageLoss,
	};
}
