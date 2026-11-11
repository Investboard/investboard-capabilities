import type { HoldingAttributionResult } from "./internal/performance/holding-attribution.js";
import type { CurrencyAttributionResult } from "./internal/performance/currency-attribution.js";
import type { ReplayedPosition } from "./internal/performance/position-replay.js";
import type {
	Snapshot,
	TwrResult,
	XirrResult,
} from "./internal/performance/types.js";

export type {
	Snapshot,
	TwrResult,
	XirrResult,
	ReplayedPosition,
	HoldingAttributionResult,
	CurrencyAttributionResult,
};

export interface DatedValue {
	readonly date: string;
	readonly value: number;
}

export interface PerformancePosition {
	readonly id: string;
	readonly label: string;
	/** Caller-declared security identity, required for paired custody transfers. */
	readonly instrumentId?: string;
	readonly quoteCurrency: string;
	/** Quantity as of request.asOfDate, including every effect through that date. */
	readonly currentQuantity: number;
	/** Earliest defensible date for an unexplained opening balance. */
	readonly anchorDate: string;
	/** Unadjusted closes in quote currency; splits are replayed separately. */
	readonly prices: readonly DatedValue[];
	readonly priceSource: string;
	/** One quote-currency unit in reporting currency. Never invert implicitly. */
	readonly fxRates?: readonly DatedValue[];
	readonly fxSource?: string;
	/** Current recorded annual rate, a fraction. Null/omitted means unknown. */
	readonly annualExpenseRatio?: number | null;
}

export interface PerformanceEffect {
	readonly id: string;
	readonly holdingId: string;
	readonly date: string;
	readonly type: "buy" | "sell" | "transfer" | "split" | "merger";
	/** Positive for buy/sell, signed for transfer, zero for split/merger. */
	readonly quantity: number;
	readonly splitRatio?: number;
	/** Stable same-day order. Splits precede trades. */
	readonly order?: number;
	/** Exactly two opposite transfer effects in this book share this ID. */
	readonly transferGroup?: string;
}

export interface PerformanceCashFlow {
	readonly id: string;
	readonly holdingId: string | null;
	readonly date: string;
	/** Buy/sell mean funding into/out of this holdings book, not brokerage orders. */
	readonly type: "buy" | "sell" | "dividend";
	/** Nonnegative reporting-currency amount, rounded to cents; dividends gross. */
	readonly amount: number;
}

export interface RecordedCost {
	readonly date: string;
	readonly holdingId: string | null;
	readonly fees: number;
	readonly taxes: number | null;
	/**
	 * True when `fees` were booked on their own, paid into the book without
	 * buying anything; such a fee enters the returns as money paid in on its
	 * date. False or omitted means the fee sits inside a trade's funding
	 * amount. Taxes never become return flows.
	 */
	readonly standalone?: boolean;
}

export interface PerformanceRequest {
	readonly reportingCurrency: string;
	readonly asOfDate: string;
	/** False refuses calculation: a truncated ledger cannot establish returns. */
	readonly ledgerComplete: boolean;
	/** Post-flow holdings-only NAV. Paid-out income is absent from these values. */
	readonly snapshots: readonly Snapshot[];
	/** Retain sold/closed holdings. Do not filter by current positive quantity. */
	readonly positions: readonly PerformancePosition[];
	/** Complete dated ledger through asOfDate, including after-window effects. */
	readonly effects: readonly PerformanceEffect[];
	/** Funding and distributed dividends in this book; internal funding nets zero. */
	readonly cashFlows: readonly PerformanceCashFlow[];
	/** Omitted means unknown, [] explicitly means no recorded costs. */
	readonly recordedCosts?: readonly RecordedCost[];
	/** Select a fixed historical basket before calculating every metric. */
	readonly scopeHoldingIds?: readonly string[];
}

/** v4 is pinned by new evaluations; a saved v3 snapshot replays under its own rules. */
export type PerformanceMethodologyVersion =
	| "actual-position-performance-v3"
	| "actual-position-performance-v4";

export interface PerformanceSnapshot {
	readonly methodologyVersion: PerformanceMethodologyVersion;
	readonly request: PerformanceRequest;
}

export interface PositionEvidence {
	readonly id: string;
	readonly source: "ledger" | "opening_balance";
	readonly status: "included" | "excluded" | "not_held";
	readonly reason:
		| "unsupported_position_effect"
		| "negative_position_history"
		| "position_reconciliation_failed"
		| null;
	readonly missingValuationCount: number;
}

export interface TransferValuation {
	readonly effectIds: readonly string[];
	readonly date: string;
	readonly internal: boolean;
	/** Nonnegative funding value after same-day cent allocation. */
	readonly value: number;
	/** Value minus its independently rounded magnitude, including for outflows. */
	readonly roundingAdjustment: number;
	readonly quoteCurrency: string;
	readonly price: number;
	readonly fxRate: number;
}

export interface PerformanceWealthBridge {
	readonly currency: string;
	readonly openingWealth: number;
	readonly closingWealth: number;
	/** Funding into (+) and out of (-) the book, including standalone fees paid in. */
	readonly securityFunding: number;
	readonly distributedIncome: number;
	readonly netExternalFlows: number;
	readonly investmentResult: number;
	readonly localPrice: number | null;
	readonly quoteFx: number | null;
	readonly recordedFees: number | null;
	readonly recordedTaxes: number | null;
	readonly residual: number;
	readonly reconciliationGap: number;
	readonly unvaluedIntervalCount: number;
	readonly fundExpensesEmbedded: true;
}

export interface PerformanceCalculation {
	readonly scope: {
		readonly holdingIds: readonly string[];
		readonly navBasis: "supplied" | "reconstructed";
	};
	readonly window: { readonly from: string; readonly to: string };
	readonly timeWeightedReturn: TwrResult;
	readonly moneyWeightedReturn: XirrResult;
	readonly attribution: HoldingAttributionResult;
	readonly currencyAttribution: CurrencyAttributionResult;
	readonly coverage: {
		readonly fraction: number | null;
		readonly basis: "historical_capital_days";
	};
	readonly fundCostEstimate: {
		readonly amount: number;
		readonly currency: string;
		readonly coverageFraction: number | null;
		readonly basis: "current_recorded_rates_historical_positions";
		readonly confidence: "medium" | "low" | null;
		readonly deductedFromReturn: false;
	};
	readonly wealthBridge: PerformanceWealthBridge;
	readonly positions: readonly PositionEvidence[];
	readonly replay: readonly ReplayedPosition[];
	readonly transfers: readonly TransferValuation[];
}

export type PerformanceReason =
	| "incomplete_ledger"
	| "insufficient_history"
	| "scope_history_missing"
	| "undefined_subperiod"
	| "opening_balance_inferred"
	| "position_history_excluded"
	| "valuation_missing"
	| "transfer_valuation_missing"
	| "coverage_incomplete"
	| "coverage_unknown"
	| "unlinked_capital"
	| "unexplained_return"
	| "sparse_snapshot_history"
	| "fund_cost_coverage_incomplete"
	| "fund_cost_coverage_unknown"
	| "wealth_bridge_incomplete"
	| "money_weighted_return_unavailable";

export type PerformanceResult = {
	readonly reportingCurrency: string;
	readonly snapshot: PerformanceSnapshot;
	readonly reasonCodes: readonly PerformanceReason[];
} & (
	| {
			readonly status: "available" | "partial";
			readonly calculation: PerformanceCalculation;
	  }
	| { readonly status: "unavailable"; readonly calculation: null }
);
