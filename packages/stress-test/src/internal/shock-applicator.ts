import { stressCurrencyExposure } from "./currency-exposure.js";
import { applyReturnToValue, scenarioFxRatio } from "./scenario-fx.js";
import type { CrisisDefinition } from "./scenarios/crisis-definitions.js";
import { resolveStressTestSector } from "./scenarios/sector-enum.js";
import type { StressHoldingInput } from "./types.js";
export interface ShockResult {
	shockApplied: number;
	postStressValue: number;
	absoluteLoss: number;
	percentageLoss: number;
	shockSource: "historical_price" | "sector_proxy" | "asset_class_default";
	betaAdjusted: boolean;
	fxShockApplied: number | null;
	currencyMethod: "unknown" | "economic_exposure" | "hedged";
}
export const ASSET_CLASS_SHOCK_PROXY: ReadonlyMap<string, string> = new Map([
	["real_estate", "alternatives"],
	["commodities", "alternatives"],
]);
export function assetClassShock(
	crisis: Pick<CrisisDefinition, "assetClassShocks">,
	assetClass: string,
): number | undefined {
	const shocks = crisis.assetClassShocks;
	if (Object.hasOwn(shocks, assetClass)) return shocks[assetClass];
	const proxy = ASSET_CLASS_SHOCK_PROXY.get(assetClass);
	return proxy !== undefined && Object.hasOwn(shocks, proxy)
		? shocks[proxy]
		: undefined;
}
export function applyShock(
	holding: StressHoldingInput,
	crisis: CrisisDefinition,
	baseCurrency: "EUR" | "USD" = "EUR",
): ShockResult {
	let shock: number;
	let source: ShockResult["shockSource"];
	if (holding.assetClass !== "equities") {
		shock = assetClassShock(crisis, holding.assetClass) ?? 0;
		source = "asset_class_default";
	} else {
		const resolvedSector = resolveStressTestSector(
			holding.sector,
			holding.assetClass,
		);
		shock =
			crisis.sectorShocks[resolvedSector] ??
			crisis.assetClassShocks.equities ??
			0;
		source = "sector_proxy";
	}
	shock = Math.max(shock, -1.0);
	const exposure = stressCurrencyExposure(holding);
	const ratio = exposure?.source
		? scenarioFxRatio(crisis, exposure.currency, baseCurrency)
		: null;
	const fxShockApplied = ratio === null ? null : ratio - 1;
	const finalShock = Math.max((1 + shock) * (ratio ?? 1) - 1, -1);
	const { postStressValue, absoluteLoss, percentageLoss } = applyReturnToValue(
		holding.currentValue,
		finalShock,
	);
	return {
		shockApplied: Math.round(finalShock * 10000) / 10000,
		postStressValue,
		absoluteLoss,
		percentageLoss,
		shockSource: source,
		betaAdjusted: false,
		fxShockApplied:
			fxShockApplied === null
				? null
				: Math.round(fxShockApplied * 10000) / 10000,
		currencyMethod:
			ratio === null
				? "unknown"
				: exposure?.hedge === "hedged"
					? "hedged"
					: "economic_exposure",
	};
}
