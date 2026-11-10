export type ReportingCurrency = "EUR" | "USD";
export type AlternativeKind = "keep" | "fresh_cash" | "partial_cash" | "sales";
export type Feasibility = "feasible" | "conditional" | "unavailable";
export type Priority = "minimize_sales" | "target_alignment";

/** Fractions, not percentage points. Every target must lie inside its corridor. */
export interface AllocationBand {
	min: number;
	target: number;
	max: number;
}
export type AllocationPolicy = Record<string, AllocationBand>;
export interface AllocationPosition {
	assetClass: string;
	value: number;
}
export interface Holding {
	holdingId: string;
	depotId: string;
	assetClass: string;
	/** Already in the reporting currency. Null withholds the whole comparison. */
	value: number | null;
	currency: string;
}
export interface AllocationPreferences {
	/** Reporting-currency units; default 0.01. */
	minTradeSize?: number;
	/** Number of security allocations, excluding retained cash; default 100. */
	maxTrades?: number;
}
export interface AllocationRequest extends AllocationPreferences {
	positions: AllocationPosition[];
	policy: AllocationPolicy;
	contribution: number;
	cashFloor?: number;
}
export interface ContributionAllocation {
	assetClass: string;
	amount: number;
	proportion: number;
}
export interface ContributionResult {
	allocations: ContributionAllocation[];
	retainedCash: number;
	postContributionValue: number;
}
export interface AccountRules {
	depotId: string;
	/** Null is unknown, including when a declared fee is unavailable. */
	feePerTrade: number | null;
	minimum: number;
	/** Zero means no cap. */
	maximum: number;
	increment: number;
}
export interface Purchase {
	/** Null is a class allocation without a selected holding. No instrument is invented. */
	holdingId: string | null;
	depotId: string;
	assetClass: string;
	amount: number;
}
export interface Sale {
	holdingId: string;
	amount: number;
	/** Estimate for this exact sale, in reporting currency. Null remains unknown. */
	tax: { amount: number; source: string } | null;
}
export interface SalePlan {
	sales: Sale[];
	purchases: Purchase[];
}
export interface RebalanceRequest extends AllocationPreferences {
	baseCurrency: ReportingCurrency;
	holdings: Holding[];
	policy: AllocationPolicy;
	contribution: number;
	cashLimit: number;
	fundingDepotId: string;
	cashFloor?: number;
	accounts?: AccountRules[];
	transfersConfirmed?: boolean;
	priority?: Priority;
	/** Explicit caller-selected plan. The module does not choose tax-efficient sales. */
	salePlan?: SalePlan;
}
export interface AllocationRow {
	assetClass: string;
	value: number;
	current: number | null;
	target: number;
	minimum: number;
	maximum: number;
	deviation: number | null;
	inRange: boolean | null;
}
export interface FundingRow {
	depotId: string;
	externalCash: number;
	grossSales: number;
	taxCost: number | null;
	fees: number | null;
	purchases: number;
	/** Can be negative when the supplied tax exceeds sale proceeds. */
	netInflow: number | null;
	transferRequired: number | null;
}
export type ReasonCode =
	| "incomplete_valuation"
	| "currency_mismatch"
	| "account_rules_unknown"
	| "fees_unknown"
	| "sale_plan_required"
	| "sale_tax_unknown"
	| "sale_constraints_not_met"
	| "purchase_constraints_not_met"
	| "minimum_trade_not_met"
	| "trade_limit_exceeded"
	| "insufficient_funding"
	| "reserve_shortfall"
	| "funding_transfer_required";
export interface RebalanceAlternative {
	kind: AlternativeKind;
	feasibility: Feasibility;
	reasonCodes: ReasonCode[];
	externalCash: number;
	invested: number;
	feeCost: number | null;
	taxCost: number | null;
	taxCoverage: "no_sales" | "supplied" | "unknown";
	cashRetained: number | null;
	valueAfter: number | null;
	reserveAfter: number | null;
	residualDrift: number | null;
	rows: AllocationRow[] | null;
	funding: FundingRow[];
	purchases: Purchase[];
	sales: Sale[];
}
export interface RebalanceSnapshot {
	methodologyVersion: "rebalance-comparison-v1";
	request: RebalanceRequest;
}
export interface RebalanceComparison {
	methodologyVersion: "rebalance-comparison-v1";
	baseCurrency: ReportingCurrency;
	priority: Priority;
	valueBefore: number | null;
	rowsBefore: AllocationRow[] | null;
	alternatives: RebalanceAlternative[];
	snapshot: RebalanceSnapshot;
}
export interface ProjectionRequest extends AllocationPreferences {
	positions: AllocationPosition[];
	policy: AllocationPolicy;
	cashFloor?: number;
	monthlyContribution: number;
	/** 1–600 periods; month 1 includes one contribution after its return step. */
	months: number;
	/** Explicit annual effective fractions for every class, including cash. No default returns. */
	annualReturns: Record<string, number>;
}
export interface ProjectionMonth {
	month: number;
	value: number;
	retainedCash: number;
	allocations: ContributionAllocation[];
	positions: AllocationPosition[];
	rows: AllocationRow[];
}
export interface ContributionProjection {
	methodologyVersion: "contribution-projection-v1";
	/** Defensive copy of the complete assumptions, suitable for JSON storage. */
	request: ProjectionRequest;
	timeline: ProjectionMonth[];
}
