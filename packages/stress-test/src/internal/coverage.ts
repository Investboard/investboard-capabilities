import type { HoldingImpact } from "./result-types.js";
import { stressCurrencyExposure } from "./currency-exposure.js";
import { scenarioFxRatio } from "./scenario-fx.js";
import type { CrisisDefinition } from "./scenarios/crisis-definitions.js";
import { assetClassShock } from "./shock-applicator.js";
import type { StressHoldingInput } from "./types.js";
function modelCoversHolding(
	holding: Pick<
		StressHoldingInput,
		| "assetClass"
		| "currency"
		| "economicCurrency"
		| "isin"
		| "instrumentType"
		| "priceSource"
	>,
	crisis: CrisisDefinition,
	baseCurrency: "EUR" | "USD",
) {
	const exposure = stressCurrencyExposure(holding);
	return (
		assetClassShock(crisis, holding.assetClass) !== undefined &&
		(!exposure ||
			scenarioFxRatio(crisis, exposure.currency, baseCurrency) !== null)
	);
}
export function hasStressModelCoverage(
	holdings: readonly Pick<
		StressHoldingInput,
		| "assetClass"
		| "currency"
		| "economicCurrency"
		| "isin"
		| "instrumentType"
		| "priceSource"
	>[],
	crisis: CrisisDefinition,
	baseCurrency: "EUR" | "USD",
): boolean {
	return (
		holdings.length > 0 &&
		holdings.every((holding) =>
			modelCoversHolding(holding, crisis, baseCurrency),
		)
	);
}
export function isStressScenarioCovered(
	holdings: readonly StressHoldingInput[],
	impacts: readonly HoldingImpact[],
	crisis: CrisisDefinition,
	baseCurrency: "EUR" | "USD",
): boolean {
	const byId = new Map(holdings.map((row) => [row.holdingId, row]));
	if (
		!holdings.length ||
		byId.size !== holdings.length ||
		impacts.length !== holdings.length
	)
		return false;
	const seen = new Set<string>();
	return impacts.every((impact) => {
		const holding = byId.get(impact.holdingId);
		if (
			!holding ||
			seen.has(impact.holdingId) ||
			!Number.isFinite(impact.preStressValue) ||
			impact.preStressValue < 0 ||
			!Number.isFinite(impact.postStressValue)
		)
			return false;
		seen.add(impact.holdingId);
		return (
			impact.shockSource === "historical_price" ||
			modelCoversHolding(holding, crisis, baseCurrency)
		);
	});
}
