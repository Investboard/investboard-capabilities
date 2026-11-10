import type {
	AllocationPolicy,
	AllocationPosition,
	AllocationRequest,
	Holding,
	ProjectionRequest,
	RebalanceRequest,
} from "./types.js";
import { MAX_SUPPORTED_WEALTH, toCents } from "./internal/money.js";
import {
	requireInput,
	requireJson,
	requireMoney,
	requireShape,
	requireText,
} from "./internal/input-guards.js";
export { RebalanceInputError } from "./internal/input-guards.js";

export function validatePolicy(
	policy: unknown,
): asserts policy is AllocationPolicy {
	requireInput(
		policy !== null && typeof policy === "object" && !Array.isArray(policy),
		"Policy must be a class map",
	);
	const keys = Object.keys(policy);
	requireShape(policy, keys, "Policy");
	requireInput(
		keys.length > 0 && keys.length <= 32,
		"Policy requires 1–32 classes",
	);
	let total = 0;
	for (const [key, band] of Object.entries(policy)) {
		requireText(key, "Asset class");
		requireShape(band, ["min", "target", "max"], "Allocation band");
		for (const value of [band.min, band.target, band.max])
			requireInput(
				typeof value === "number" &&
					Number.isFinite(value) &&
					value >= 0 &&
					value <= 1,
				"Allocation fractions must be between zero and one",
			);
		requireInput(
			typeof band.min === "number" &&
				typeof band.target === "number" &&
				typeof band.max === "number" &&
				band.min <= band.target &&
				band.target <= band.max,
			"Targets must lie inside their corridors",
		);
		total += band.target;
	}
	requireInput(Math.abs(total - 1) <= 1e-9, "Policy targets must sum to one");
}
function preferences(input: Record<string, unknown>): void {
	if (input.cashFloor !== undefined)
		requireMoney(input.cashFloor, "Cash floor");
	if (input.minTradeSize !== undefined)
		requireMoney(input.minTradeSize, "Minimum trade size");
	if (input.maxTrades !== undefined)
		requireInput(
			typeof input.maxTrades === "number" &&
				Number.isInteger(input.maxTrades) &&
				input.maxTrades >= 0 &&
				input.maxTrades <= 100,
			"Maximum trades must be an integer between zero and 100",
		);
}
function checkWealth(
	positions: readonly { value: number | null }[],
	contribution = 0,
): void {
	const total = positions.reduce(
		(sum, p) => sum + toCents(p.value ?? 0),
		toCents(contribution),
	);
	requireInput(
		Number.isSafeInteger(total) && total <= MAX_SUPPORTED_WEALTH * 100,
		"Portfolio plus contribution exceeds the supported wealth limit",
	);
}
function validatePositions(
	positions: unknown,
): asserts positions is AllocationPosition[] {
	requireInput(
		Array.isArray(positions) && positions.length <= 200,
		"Provide at most 200 allocation positions",
	);
	for (const p of positions) {
		requireShape(p, ["assetClass", "value"], "Allocation position");
		requireText(p.assetClass, "Asset class");
		requireMoney(p.value, "Position value");
	}
	checkWealth(positions);
}
export function validateAllocation(
	input: unknown,
): asserts input is AllocationRequest {
	requireJson(input);
	requireShape(
		input,
		[
			"positions",
			"policy",
			"contribution",
			"cashFloor",
			"minTradeSize",
			"maxTrades",
		],
		"Allocation request",
	);
	validatePolicy(input.policy);
	validatePositions(input.positions);
	requireMoney(input.contribution, "Contribution");
	preferences(input);
	checkWealth(input.positions, input.contribution);
}
function validateHoldings(holdings: unknown): asserts holdings is Holding[] {
	requireInput(
		Array.isArray(holdings) && holdings.length > 0 && holdings.length <= 200,
		"Provide 1–200 holdings",
	);
	const ids = new Set<string>();
	for (const h of holdings) {
		requireShape(
			h,
			["holdingId", "depotId", "assetClass", "value", "currency"],
			"Holding",
		);
		for (const [label, value] of Object.entries(h))
			if (["holdingId", "depotId", "assetClass"].includes(label))
				requireText(value, label);
		requireText(h.holdingId, "Holding ID");
		requireInput(
			typeof h.depotId === "string" && typeof h.assetClass === "string",
			"Holding depot and asset class are required",
		);
		requireInput(!ids.has(h.holdingId), "Holding IDs must be unique");
		ids.add(h.holdingId);
		requireInput(
			typeof h.currency === "string" && /^[A-Z]{3}$/.test(h.currency),
			"Holding currency requires a three-letter code",
		);
		if (h.value !== null) requireMoney(h.value, "Holding value");
	}
}
function validateAccounts(accounts: unknown): void {
	if (accounts === undefined) return;
	requireInput(
		Array.isArray(accounts) && accounts.length <= 100,
		"Provide at most 100 account rules",
	);
	const ids = new Set<string>();
	for (const a of accounts) {
		requireShape(
			a,
			["depotId", "feePerTrade", "minimum", "maximum", "increment"],
			"Account rules",
		);
		requireText(a.depotId, "Account depot ID");
		requireInput(!ids.has(a.depotId), "Account depot IDs must be unique");
		ids.add(a.depotId);
		if (a.feePerTrade !== null) requireMoney(a.feePerTrade, "Trade fee");
		requireMoney(a.minimum, "Account minimum");
		requireMoney(a.maximum, "Account maximum");
		requireMoney(a.increment, "Amount increment");
		requireInput(
			a.increment >= 0.01 && (a.maximum === 0 || a.maximum >= a.minimum),
			"Account increment must be positive and maximum must admit its minimum",
		);
	}
}
function validateSalePlan(plan: unknown, holdings: Holding[]): void {
	if (plan === undefined) return;
	requireShape(plan, ["sales", "purchases"], "Sale plan");
	requireInput(
		Array.isArray(plan.sales) &&
			plan.sales.length > 0 &&
			plan.sales.length <= 100,
		"Sale plan requires 1–100 sales",
	);
	requireInput(
		Array.isArray(plan.purchases) && plan.purchases.length <= 100,
		"Sale plan admits at most 100 purchases",
	);
	const byId = new Map(holdings.map((h) => [h.holdingId, h]));
	const sold = new Set<string>();
	for (const sale of plan.sales) {
		requireShape(sale, ["holdingId", "amount", "tax"], "Sale");
		requireText(sale.holdingId, "Sale holding ID");
		requireMoney(sale.amount, "Sale amount");
		const h = byId.get(sale.holdingId);
		requireInput(
			h && !sold.has(sale.holdingId),
			"Sales require unique source holding identities",
		);
		sold.add(sale.holdingId);
		requireInput(
			sale.amount > 0 &&
				(h.value === null || toCents(sale.amount) <= toCents(h.value)),
			"A sale must be positive and cannot exceed its holding",
		);
		if (sale.tax !== null) {
			requireShape(sale.tax, ["amount", "source"], "Sale tax");
			requireMoney(sale.tax.amount, "Sale tax");
			requireText(sale.tax.source, "Sale tax source");
		}
	}
	for (const buy of plan.purchases) {
		requireShape(
			buy,
			["holdingId", "depotId", "assetClass", "amount"],
			"Purchase",
		);
		requireText(buy.depotId, "Purchase depot ID");
		requireText(buy.assetClass, "Purchase class");
		requireMoney(buy.amount, "Purchase amount");
		requireInput(buy.amount > 0, "Purchase amount must be positive");
		requireInput(
			buy.assetClass !== "cash",
			"Cash is retained funding, not a fee-bearing purchase",
		);
		if (buy.holdingId !== null) {
			requireText(buy.holdingId, "Purchase holding ID");
			const h = byId.get(buy.holdingId);
			requireInput(
				h && h.depotId === buy.depotId && h.assetClass === buy.assetClass,
				"A purchase holding must match its depot and class",
			);
		}
	}
}
export function validateRequest(
	input: unknown,
): asserts input is RebalanceRequest {
	requireJson(input);
	requireShape(
		input,
		[
			"baseCurrency",
			"holdings",
			"policy",
			"contribution",
			"cashLimit",
			"fundingDepotId",
			"cashFloor",
			"accounts",
			"transfersConfirmed",
			"priority",
			"salePlan",
			"minTradeSize",
			"maxTrades",
		],
		"Rebalance request",
	);
	requireInput(
		input.baseCurrency === "EUR" || input.baseCurrency === "USD",
		"Reporting currency must be EUR or USD",
	);
	validateHoldings(input.holdings);
	validatePolicy(input.policy);
	preferences(input);
	validateAccounts(input.accounts);
	requireMoney(input.contribution, "Contribution");
	requireMoney(input.cashLimit, "Cash limit");
	requireInput(
		input.cashLimit <= input.contribution,
		"Cash limit cannot exceed the contribution",
	);
	requireText(input.fundingDepotId, "Funding depot ID");
	if (input.transfersConfirmed !== undefined)
		requireInput(
			typeof input.transfersConfirmed === "boolean",
			"Transfer confirmation must be boolean",
		);
	if (input.priority !== undefined)
		requireInput(
			input.priority === "minimize_sales" ||
				input.priority === "target_alignment",
			"Unsupported comparison priority",
		);
	checkWealth(
		input.holdings.filter((h) => h.currency === input.baseCurrency),
		input.contribution,
	);
	validateSalePlan(input.salePlan, input.holdings);
}
export function validateProjection(
	input: unknown,
): asserts input is ProjectionRequest {
	requireJson(input);
	requireShape(
		input,
		[
			"positions",
			"policy",
			"cashFloor",
			"monthlyContribution",
			"months",
			"annualReturns",
			"minTradeSize",
			"maxTrades",
		],
		"Projection request",
	);
	validatePositions(input.positions);
	validatePolicy(input.policy);
	preferences(input);
	requireMoney(input.monthlyContribution, "Monthly contribution");
	requireInput(
		typeof input.months === "number" &&
			Number.isInteger(input.months) &&
			input.months >= 1 &&
			input.months <= 600,
		"Projection requires 1–600 months",
	);
	requireInput(
		input.annualReturns !== null &&
			typeof input.annualReturns === "object" &&
			!Array.isArray(input.annualReturns),
		"Annual return assumptions are required",
	);
	requireShape(
		input.annualReturns,
		Object.keys(input.annualReturns),
		"Annual returns",
	);
	requireInput(
		Object.keys(input.annualReturns).length <= 233,
		"Too many annual return assumptions",
	);
	const classes = new Set([
		"cash",
		...input.positions.map((p) => p.assetClass),
		...Object.keys(input.policy),
	]);
	for (const key of classes)
		requireInput(
			Object.hasOwn(input.annualReturns, key),
			`Annual return assumption required for ${key}`,
		);
	for (const rate of Object.values(input.annualReturns))
		requireInput(
			typeof rate === "number" &&
				Number.isFinite(rate) &&
				rate >= -1 &&
				rate <= 10,
			"Annual returns must be fractions between -1 and 10",
		);
}
