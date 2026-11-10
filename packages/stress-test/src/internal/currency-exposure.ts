import type { StressHoldingInput } from "./types.js";
export function stressCurrencyExposure(
	holding: Pick<
		StressHoldingInput,
		| "assetClass"
		| "currency"
		| "economicCurrency"
		| "isin"
		| "instrumentType"
		| "priceSource"
	>,
) {
	if (holding.economicCurrency?.source.trim()) return holding.economicCurrency;
	return holding.assetClass === "cash" &&
		!holding.isin &&
		(holding.instrumentType === "cash" ||
			(holding.instrumentType === "other" &&
				holding.priceSource === "manual")) &&
		holding.currency
		? {
				currency: holding.currency,
				hedge: "unhedged" as const,
				source: "cash_denomination",
			}
		: null;
}
