import {
	validateCashDeployment,
	validateCashFunding,
	validatePlacement,
} from "./internal/validate-policies.js";
import type { CalculationContext } from "./configuration.js";
import { calculationContext } from "./configuration.js";
import {
	requireInput,
	requireJson,
	requireShape,
} from "./internal/input-guards.js";
import {
	checkClasses,
	checkWealth,
	preferences,
	text,
	validateHoldings,
	validatePolicy,
	validatePositions,
} from "./internal/validate-inputs.js";
import {
	validateAccounts,
	validatePlan,
} from "./internal/validate-operations.js";
export { RebalanceInputError } from "./internal/input-guards.js";

function begin(
	input: unknown,
	keys: string[],
	label: string,
): { data: Record<string, unknown>; ctx: CalculationContext } {
	requireShape(input, ["configuration", ...keys], label);
	const ctx = calculationContext(input.configuration);
	requireJson(input, ctx.configuration.limits);
	return { data: input, ctx };
}
export function validateAllocation(input: unknown): CalculationContext {
	const parsed = begin(
		input,
		[
			"positions",
			"policy",
			"contribution",
			"cashDeployment",
			"cashFloor",
			"minTradeSize",
			"maxTrades",
		],
		"Allocation request",
	);
	const ctx: CalculationContext = parsed.ctx;
	const data = parsed.data;
	validateCashDeployment(data.cashDeployment);
	validatePolicy(data.policy, ctx);
	validatePositions(data.positions, ctx);
	ctx.money.requireMoney(data.contribution, "Contribution");
	preferences(data, ctx);
	checkClasses(data.positions, data.policy, ctx);
	checkWealth(data.positions, data.contribution, ctx);
	return ctx;
}
export function validateRequest(input: unknown): CalculationContext {
	const parsed = begin(
		input,
		[
			"baseCurrency",
			"purchasePlacement",
			"cashDeployment",
			"holdings",
			"policy",
			"scenarios",
			"fundingDepotId",
			"cashFloor",
			"accounts",
			"transfersConfirmed",
			"priority",
			"minTradeSize",
			"maxTrades",
		],
		"Rebalance request",
	);
	const ctx: CalculationContext = parsed.ctx;
	const data = parsed.data;
	text(data.baseCurrency, "Reporting currency", ctx);
	requireInput(
		ctx.configuration.allowedCurrencies === undefined ||
			ctx.configuration.allowedCurrencies.includes(data.baseCurrency),
		"Reporting currency is outside the configured currency policy",
	);
	validateHoldings(data.holdings, ctx);
	validateCashFunding(data.cashDeployment, data.holdings, ctx);
	validatePlacement(data.purchasePlacement, data.holdings, ctx);
	validatePolicy(data.policy, ctx);
	checkClasses(data.holdings, data.policy, ctx);
	preferences(data, ctx);
	validateAccounts(data.accounts, ctx);
	text(data.fundingDepotId, "Funding depot ID", ctx);
	if (data.transfersConfirmed !== undefined)
		requireInput(
			typeof data.transfersConfirmed === "boolean",
			"Transfer confirmation must be boolean",
		);
	if (data.priority !== undefined)
		requireInput(
			["input_order", "minimize_sales", "target_alignment"].includes(
				data.priority as string,
			),
			"Unsupported comparison priority",
		);
	requireInput(
		Array.isArray(data.scenarios) &&
			data.scenarios.length > 0 &&
			data.scenarios.length <= ctx.configuration.limits.scenarios,
		"Scenarios exceed the configured capacity or are empty",
	);
	const ids = new Set<string>();
	for (const scenario of data.scenarios) {
		requireShape(
			scenario,
			["kind", "mode", "externalCash", "plan", "fundingDepotId", "reasonCodes"],
			"Scenario",
		);
		text(scenario.kind, "Scenario ID", ctx);
		requireInput(!ids.has(scenario.kind), "Scenario IDs must be unique");
		ids.add(scenario.kind);
		if (scenario.mode === "keep")
			requireShape(scenario, ["kind", "mode"], "Keep scenario");
		else if (scenario.mode === "unavailable") {
			requireShape(
				scenario,
				["kind", "mode", "reasonCodes"],
				"Unavailable scenario",
			);
			requireInput(
				Array.isArray(scenario.reasonCodes) && scenario.reasonCodes.length > 0,
				"Unavailable scenario requires reasons",
			);
			for (const reason of scenario.reasonCodes)
				text(reason, "Scenario reason", ctx);
		} else {
			requireInput(
				scenario.mode === "contribution" || scenario.mode === "plan",
				"Unsupported scenario mode",
			);
			requireShape(
				scenario,
				scenario.mode === "plan"
					? ["kind", "mode", "externalCash", "plan", "fundingDepotId"]
					: ["kind", "mode", "externalCash", "fundingDepotId"],
				"Funded scenario",
			);
			ctx.money.requireMoney(scenario.externalCash, "Scenario contribution");
			if (scenario.fundingDepotId !== undefined)
				text(scenario.fundingDepotId, "Scenario funding depot", ctx);
			if (scenario.mode === "plan") {
				validatePlan(scenario.plan, data.holdings, ctx);
				checkClasses(
					data.holdings,
					data.policy,
					ctx,
					scenario.plan.purchases.map((p) => p.assetClass),
				);
			}
		}
		checkWealth(
			data.holdings.filter((h) => h.currency === data.baseCurrency),
			typeof scenario.externalCash === "number" ? scenario.externalCash : 0,
			ctx,
		);
	}
	return ctx;
}
export function validateProjection(input: unknown): CalculationContext {
	const parsed = begin(
		input,
		[
			"positions",
			"policy",
			"cashFloor",
			"contributions",
			"periods",
			"periodsPerYear",
			"annualReturns",
			"cashSweep",
			"minTradeSize",
			"maxTrades",
		],
		"Projection request",
	);
	const ctx: CalculationContext = parsed.ctx;
	const data = parsed.data;
	validatePositions(data.positions, ctx);
	validatePolicy(data.policy, ctx);
	checkClasses(data.positions, data.policy, ctx);
	preferences(data, ctx);
	requireInput(
		data.cashSweep === "retain" || data.cashSweep === "reinvest_excess",
		"Choose retain or reinvest_excess projection cash handling",
	);
	requireInput(
		typeof data.periods === "number" &&
			Number.isSafeInteger(data.periods) &&
			data.periods >= 1 &&
			data.periods <= ctx.configuration.limits.projectionPeriods,
		"Projection exceeds the configured horizon",
	);
	requireInput(
		typeof data.periodsPerYear === "number" &&
			Number.isSafeInteger(data.periodsPerYear) &&
			data.periodsPerYear > 0,
		"Periods per year must be a positive safe integer",
	);
	if (Array.isArray(data.contributions)) {
		requireInput(
			data.contributions.length === data.periods,
			"Contribution schedule must match the period count",
		);
		for (const amount of data.contributions)
			ctx.money.requireMoney(amount, "Period contribution");
	} else ctx.money.requireMoney(data.contributions, "Period contribution");
	const assumptions = Array.isArray(data.annualReturns)
		? data.annualReturns
		: [data.annualReturns];
	requireInput(
		!Array.isArray(data.annualReturns) || assumptions.length === data.periods,
		"Return schedule must match the period count",
	);
	const classes = new Set([
		ctx.configuration.cashAssetClass,
		...data.positions.map((p) => p.assetClass),
		...Object.keys(data.policy),
	]);
	for (const returns of assumptions) {
		requireInput(
			returns !== null &&
				typeof returns === "object" &&
				!Array.isArray(returns),
			"Annual return assumptions are required",
		);
		requireShape(returns, Object.keys(returns), "Annual returns");
		for (const key of classes)
			requireInput(
				Object.hasOwn(returns, key),
				"Annual return assumption required for " + key,
			);
		for (const rate of Object.values(returns)) {
			requireInput(
				typeof rate === "number" && Number.isFinite(rate) && rate >= -1,
				"Annual returns must be finite fractions at least -1",
			);
			const range = ctx.configuration.annualReturnRange;
			if (range)
				requireInput(
					rate >= range.minimum && rate <= range.maximum,
					"Annual return is outside the configured range",
				);
		}
	}
	return ctx;
}
