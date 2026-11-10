export type ReportingCurrency = string;
export type AlternativeKind = string;
export type Feasibility = "feasible" | "conditional" | "unavailable";
export type Priority = "input_order" | "minimize_sales" | "target_alignment";

export interface RebalancingConfiguration {
	money: { decimalPlaces: number; maximumAmount: number };
	limits: {
		holdings: number;
		assetClasses: number;
		accounts: number;
		orders: number;
		projectionPeriods: number;
		scenarios: number;
		jsonNodes: number;
		jsonDepth: number;
		collectionEntries: number;
		textLength: number;
	};
	cashAssetClass: string;
	allowedCurrencies?: string[];
	annualReturnRange?: { minimum: number; maximum: number };
}
export interface FeeSchedule {
	fixed: number;
	rate: number;
	minimum?: number;
	maximum?: number;
	rounding: "up" | "nearest" | "down";
}

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
	/** Default: one configured minor unit. */
	minTradeSize?: number;
	/** Default: the caller's configured order limit. */
	maxTrades?: number;
}
export type CashDeployment = "preserve" | "deploy_excess";
export type PurchasePlacement =
	| { mode: "largest_holding" }
	| { mode: "ordered_routes"; routes: PurchaseRoute[] };
export interface PurchaseRoute {
	assetClass: string;
	holdingId: string | null;
	depotId: string;
}
export type CashFundingPolicy =
	| { mode: "preserve" }
	| { mode: "deploy_excess"; holdingIds: string[] };
/** Cash released to a scenario's funding budget; this is not a security sale. */
export interface CashRelease {
	holdingId: string;
	amount: number;
}
export interface AllocationRequest extends AllocationPreferences {
	cashDeployment: CashDeployment;
	configuration: RebalancingConfiguration;
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
	existingCashReleased: number;
	allocations: ContributionAllocation[];
	retainedCash: number;
	postContributionValue: number;
}
export interface AccountRules {
	depotId: string;
	/** Null is unknown, including when a declared fee is unavailable. */
	feePerTrade?: number | null;
	/** Mutually exclusive with feePerTrade. */
	fees?: { buy: FeeSchedule | null; sell: FeeSchedule | null };
	minimum: number;
	/** Zero means no cap. */
	maximum: number;
	increment: number;
}
export interface Purchase {
	/** Optional fee from an external model. Null stays unknown. */
	fee?: number | null;
	/** Null is a class allocation without a selected holding. No instrument is invented. */
	holdingId: string | null;
	depotId: string;
	assetClass: string;
	amount: number;
}
export interface Sale {
	fee?: number | null;
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
	purchasePlacement: PurchasePlacement;
	cashDeployment: CashFundingPolicy;
	configuration: RebalancingConfiguration;
	baseCurrency: ReportingCurrency;
	holdings: Holding[];
	policy: AllocationPolicy;
	scenarios: RebalanceScenario[];
	fundingDepotId: string;
	cashFloor?: number;
	accounts?: AccountRules[];
	transfersConfirmed?: boolean;
	priority?: Priority;
}
export type RebalanceScenario =
	| { kind: string; mode: "keep" }
	| {
			kind: string;
			mode: "contribution";
			externalCash: number;
			fundingDepotId?: string;
	  }
	| {
			kind: string;
			mode: "plan";
			externalCash: number;
			plan: SalePlan;
			fundingDepotId?: string;
	  }
	| { kind: string; mode: "unavailable"; reasonCodes: ReasonCode[] };
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
	existingCashReleased: number;
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
/** Hosts may add reason codes for explicitly unavailable scenarios. */
export type ReasonCode = string;
export type BuiltinReasonCode =
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
	existingCashReleased: number;
	cashReleases: CashRelease[];
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
	methodologyVersion: "rebalance-comparison-v4";
	request: RebalanceRequest;
}
export interface RebalanceComparison {
	methodologyVersion: "rebalance-comparison-v4";
	baseCurrency: ReportingCurrency;
	priority: Priority;
	valueBefore: number | null;
	rowsBefore: AllocationRow[] | null;
	alternatives: RebalanceAlternative[];
	snapshot: RebalanceSnapshot;
}
export interface ProjectionRequest extends AllocationPreferences {
	configuration: RebalancingConfiguration;
	positions: AllocationPosition[];
	policy: AllocationPolicy;
	cashFloor?: number;
	cashSweep: "retain" | "reinvest_excess";
	periods: number;
	periodsPerYear: number;
	/** Constant contribution or one explicit amount per period. */
	contributions: number | number[];
	/** Constant assumptions or one annual-effective class map per period. */
	annualReturns: Record<string, number> | Record<string, number>[];
}
export interface ProjectionPeriod {
	period: number;
	contribution: number;
	existingCashReleased: number;
	value: number;
	retainedCash: number;
	allocations: ContributionAllocation[];
	positions: AllocationPosition[];
	rows: AllocationRow[];
}
export interface ContributionProjection {
	methodologyVersion: "contribution-projection-v3";
	/** Defensive copy of the complete assumptions, suitable for JSON storage. */
	request: ProjectionRequest;
	timeline: ProjectionPeriod[];
}
