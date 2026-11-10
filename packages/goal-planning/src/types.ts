export type ReportingCurrency = "EUR" | "USD";

/** Already converted to the request currency. Never spendable by the cash ledger. */
export interface StartingCapital {
	amount: number;
	asOfDate: string;
	/** Stable caller identities prevent the same capital backing several goals. */
	sourceIds: string[];
}

export interface CashGoal {
	id: string;
	deadline: string | null;
	monthlyContribution: number | null;
	/** Nominal amount at the deadline; caller supplies any inflation adjustment. */
	targetAmount: number | null;
	startingCapital: StartingCapital | null;
}

export interface RecurringPayment {
	id: string;
	monthlyAmount: number | null;
	/** Inclusive bounds, sampled at each monthly savings event. */
	startDate: string | null;
	endDate: string | null;
}

export interface LiquidityNeed {
	id: string;
	dueDate: string;
	amount: number;
}

/** Plain JSON. Every monetary value uses reportingCurrency and two decimals. */
export interface GoalCashRequest {
	reportingCurrency: ReportingCurrency;
	asOfDate: string;
	/** Unallocated money only: exclude startingCapital and other earmarked wealth. */
	unallocatedCash: number | null;
	reserveFloor: number | null;
	/** Monthly surplus before goal funding; negative means a recurring deficit. */
	monthlyCapacity: number | null;
	obligationsComplete: boolean;
	paymentsTreatment: "already_netted" | "subtract_recorded" | "unknown";
	recurringPayments: RecurringPayment[];
	liquidityNeeds: LiquidityNeed[];
	goals: CashGoal[];
}

export type PlanReason =
	| "obligations_not_confirmed_complete"
	| "unallocated_cash_missing"
	| "reserve_floor_missing"
	| "monthly_capacity_missing"
	| "payment_netting_unknown"
	| "recurring_payment_missing"
	| "goal_commitment_missing"
	| "amounts_exceed_supported_range"
	| "reserve_underfunded";

export type GoalReason =
	| "deadline_missing"
	| "contribution_missing"
	| "target_missing"
	| "starting_capital_missing"
	| "starting_capital_not_current"
	| "starting_capital_shared_by_goals"
	| "amounts_exceed_supported_range";

export interface GoalFundingOutcome {
	goalId: string;
	horizonMonths: number | null;
	currentCapital: number | null;
	requestedTotal: number | null;
	fundedTotal: number | null;
	/** Current capital plus funded contributions, without growth, fees or tax. */
	noGrowthOutcome: number | null;
	targetGap: number | null;
	reasonCodes: GoalReason[];
}

export interface GoalAllocation {
	goalId: string;
	requested: number;
	funded: number;
}

export interface CashScheduleRow {
	date: string;
	/** Null for a dated-payment-only event; otherwise 1-based savings month. */
	month: number | null;
	cash: number;
	netCapacity: number;
	liquidityPaid: number;
	liquidityShortfall: number;
	obligationsShortfall: number;
	overduePayments: number;
	/** Part of cash, not an additional expense. Excludes the reserve floor. */
	futureCommitmentReserve: number;
	/** Cash left after floor, future buffer and arrears; not swept into goals. */
	availableCash: number;
	allocations: GoalAllocation[];
}

export interface GoalCashSnapshot {
	methodologyVersion: "goal-cash-schedule-v1";
	request: GoalCashRequest;
}

export interface GoalCashResult {
	/** Feasible means cash requests fit, not that investment targets are achieved. */
	status: "feasible" | "constrained" | "incomplete";
	reportingCurrency: ReportingCurrency;
	snapshot: GoalCashSnapshot;
	reasonCodes: PlanReason[];
	rows: CashScheduleRow[];
	goals: GoalFundingOutcome[];
}
