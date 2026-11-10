import type { Holding, SalePlan } from "../types.js";
import type { CalculationContext } from "../configuration.js";
import { requireInput, requireShape } from "./input-guards.js";
import { text } from "./validate-inputs.js";

function schedule(value: unknown, ctx: CalculationContext): void {
	if (value === null) return;
	requireShape(
		value,
		["fixed", "rate", "minimum", "maximum", "rounding"],
		"Fee schedule",
	);
	ctx.money.requireMoney(value.fixed, "Fixed fee");
	requireInput(
		typeof value.rate === "number" &&
			Number.isFinite(value.rate) &&
			value.rate >= 0,
		"Fee rate must be a nonnegative fraction",
	);
	if (value.minimum !== undefined)
		ctx.money.requireMoney(value.minimum, "Minimum fee");
	if (value.maximum !== undefined)
		ctx.money.requireMoney(value.maximum, "Maximum fee");
	requireInput(
		value.maximum === undefined ||
			(typeof value.maximum === "number" &&
				value.maximum >=
					(typeof value.minimum === "number" ? value.minimum : 0)),
		"Fee caps must admit their minimum",
	);
	requireInput(
		["up", "nearest", "down"].includes(value.rounding as string),
		"Fee rounding must be up, nearest or down",
	);
}
export function validateAccounts(
	accounts: unknown,
	ctx: CalculationContext,
): void {
	if (accounts === undefined) return;
	requireInput(
		Array.isArray(accounts) &&
			accounts.length <= ctx.configuration.limits.accounts,
		"Accounts exceed the configured capacity",
	);
	const ids = new Set<string>();
	for (const a of accounts) {
		requireShape(
			a,
			["depotId", "feePerTrade", "fees", "minimum", "maximum", "increment"],
			"Account rules",
		);
		text(a.depotId, "Account depot ID", ctx);
		requireInput(!ids.has(a.depotId), "Account depot IDs must be unique");
		ids.add(a.depotId);
		requireInput(
			Object.hasOwn(a, "fees") !== Object.hasOwn(a, "feePerTrade"),
			"Choose exactly one feePerTrade or buy/sell fee schedule",
		);
		if (Object.hasOwn(a, "fees")) {
			requireShape(a.fees, ["buy", "sell"], "Buy/sell fees");
			schedule(a.fees.buy, ctx);
			schedule(a.fees.sell, ctx);
		} else if (a.feePerTrade !== null)
			ctx.money.requireMoney(a.feePerTrade, "Trade fee");
		ctx.money.requireMoney(a.minimum, "Account minimum");
		ctx.money.requireMoney(a.maximum, "Account maximum");
		ctx.money.requireMoney(a.increment, "Amount increment");
		requireInput(
			a.increment >= ctx.money.quantum &&
				(a.maximum === 0 || a.maximum >= a.minimum),
			"Account increment must be positive and maximum must admit its minimum",
		);
	}
}
function overrideFee(
	operation: Record<string, unknown>,
	ctx: CalculationContext,
): void {
	if (Object.hasOwn(operation, "fee") && operation.fee !== null)
		ctx.money.requireMoney(operation.fee, "Supplied order fee");
}
export function validatePlan(
	plan: unknown,
	holdings: Holding[],
	ctx: CalculationContext,
): asserts plan is SalePlan {
	requireShape(plan, ["sales", "purchases"], "Sale plan");
	requireInput(
		Array.isArray(plan.sales) &&
			plan.sales.length <= ctx.configuration.limits.orders &&
			Array.isArray(plan.purchases) &&
			plan.sales.length + plan.purchases.length <=
				ctx.configuration.limits.orders,
		"Plan exceeds the configured order capacity",
	);
	const byId = new Map(holdings.map((h) => [h.holdingId, h]));
	const sold = new Set<string>();
	for (const sale of plan.sales) {
		requireShape(sale, ["holdingId", "amount", "tax", "fee"], "Sale");
		text(sale.holdingId, "Sale holding ID", ctx);
		ctx.money.requireMoney(sale.amount, "Sale amount");
		overrideFee(sale, ctx);
		const h = byId.get(sale.holdingId);
		requireInput(
			h && !sold.has(sale.holdingId),
			"Sales require unique source holding identities",
		);
		sold.add(sale.holdingId);
		requireInput(
			sale.amount > 0 &&
				(h.value === null ||
					ctx.money.units(sale.amount) <= ctx.money.units(h.value)),
			"A sale must be positive and cannot exceed its holding",
		);
		if (sale.tax !== null) {
			requireShape(sale.tax, ["amount", "source"], "Sale tax");
			ctx.money.requireMoney(sale.tax.amount, "Sale tax");
			text(sale.tax.source, "Sale tax source", ctx);
		}
	}
	for (const buy of plan.purchases) {
		requireShape(
			buy,
			["holdingId", "depotId", "assetClass", "amount", "fee"],
			"Purchase",
		);
		text(buy.depotId, "Purchase depot ID", ctx);
		text(buy.assetClass, "Purchase class", ctx);
		ctx.money.requireMoney(buy.amount, "Purchase amount");
		overrideFee(buy, ctx);
		requireInput(
			buy.amount > 0 && buy.assetClass !== ctx.configuration.cashAssetClass,
			"Cash is retained funding; purchases must be positive security allocations",
		);
		if (buy.holdingId !== null) {
			text(buy.holdingId, "Purchase holding ID", ctx);
			const h = byId.get(buy.holdingId);
			requireInput(
				h && h.depotId === buy.depotId && h.assetClass === buy.assetClass,
				"A purchase holding must match its depot and class",
			);
		}
	}
}
