import type { StressHoldingInput } from "./internal/types.js";
import type { CrisisDefinition } from "./internal/scenarios/crisis-definitions.js";
import type {
	HoldingImpact,
	StressAttribution,
} from "./internal/result-types.js";

export type {
	StressHoldingInput,
	CrisisDefinition,
	HoldingImpact,
	StressAttribution,
};
/** EUR and every currency each built-in scenario carries a move against the euro for. */
export type ReportingCurrency = "EUR" | "USD" | "GBP" | "CHF" | "JPY";

/** Price and FX inputs are supplied by the caller; this package never fetches data. */
export interface HistoricalWindow {
	ticker: string;
	isin: string;
	currency: string;
	basis: "price" | "total";
	start: { date: string; value: number };
	end: { date: string; value: number };
	source: string;
	fx?: {
		baseCurrency: ReportingCurrency;
		from: { effectiveDate: string; rate: number };
		to: { effectiveDate: string; rate: number };
	};
}

export interface StressRequest {
	holdings: StressHoldingInput[];
	scenario: CrisisDefinition;
	baseCurrency: ReportingCurrency;
	histories?: HistoricalWindow[];
}

/** v6 is pinned by new evaluations; a saved v5 snapshot replays under its own rules. */
export type StressMethodologyVersion =
	| "whole-wealth-currency-replay-v5"
	| "whole-wealth-currency-replay-v6";

export interface StressSnapshot {
	methodologyVersion: StressMethodologyVersion;
	request: StressRequest;
}

/** A holding the scenario cannot model, left out of every calculated figure. */
export interface StressExcludedHolding {
	holdingId: string;
	ticker: string;
	name: string;
	/** Its `currentValue`, in the reporting currency. */
	value: number;
	reason: "asset_class_not_modeled" | "currency_not_modeled";
}

/** Every total, fraction and attribution covers the modeled holdings only. */
export interface StressCalculation {
	holdingImpacts: HoldingImpact[];
	preStressTotal: number;
	postStressTotal: number;
	absoluteLoss: number;
	percentageLoss: number;
	attribution: StressAttribution;
	coverage: {
		directValueFraction: number;
		proxyValueFraction: number;
		currencyDecompositionValueFraction: number;
	};
	/** Present only when at least one holding was left out. */
	excludedHoldings?: StressExcludedHolding[];
}

export interface StressResult {
	status: "available" | "partial" | "unavailable";
	reasonCodes: string[];
	interpretation: "hypothetical_replay";
	baseCurrency: ReportingCurrency;
	snapshot: StressSnapshot;
	calculation: StressCalculation | null;
}
