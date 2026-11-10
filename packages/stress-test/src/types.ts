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
export type ReportingCurrency = "EUR" | "USD";

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

export interface StressSnapshot {
	methodologyVersion: "whole-wealth-currency-replay-v5";
	request: StressRequest;
}

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
}

export interface StressResult {
	status: "available" | "partial" | "unavailable";
	reasonCodes: string[];
	interpretation: "hypothetical_replay";
	baseCurrency: ReportingCurrency;
	snapshot: StressSnapshot;
	calculation: StressCalculation | null;
}
