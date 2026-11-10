import type {
	AllocationPolicy,
	AllocationPosition,
	Holding,
} from "../types.js";
import type { CalculationContext } from "../configuration.js";
import { requireInput, requireShape, requireText } from "./input-guards.js";

export function text(
	value: unknown,
	label: string,
	ctx: CalculationContext,
): asserts value is string {
	requireText(value, label, ctx.configuration.limits.textLength);
}
export function validatePolicy(
	policy: unknown,
	ctx: CalculationContext,
): asserts policy is AllocationPolicy {
	requireInput(
		policy !== null && typeof policy === "object" && !Array.isArray(policy),
		"Policy must be a class map",
	);
	const keys = Object.keys(policy);
	requireShape(policy, keys, "Policy");
	requireInput(
		keys.length > 0 && keys.length <= ctx.configuration.limits.assetClasses,
		"Policy exceeds the configured class capacity",
	);
	let total = 0;
	for (const [key, band] of Object.entries(policy)) {
		text(key, "Asset class", ctx);
		requireShape(band, ["min", "target", "max"], "Allocation band");
		for (const v of [band.min, band.target, band.max])
			requireInput(
				typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1,
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
export function preferences(
	input: Record<string, unknown>,
	ctx: CalculationContext,
): void {
	if (input.cashFloor !== undefined)
		ctx.money.requireMoney(input.cashFloor, "Cash floor");
	if (input.minTradeSize !== undefined)
		ctx.money.requireMoney(input.minTradeSize, "Minimum trade size");
	if (input.maxTrades !== undefined)
		requireInput(
			typeof input.maxTrades === "number" &&
				Number.isSafeInteger(input.maxTrades) &&
				input.maxTrades >= 0 &&
				input.maxTrades <= ctx.configuration.limits.orders,
			"Maximum trades exceeds the configured order capacity",
		);
}
export function checkWealth(
	positions: readonly { value: number | null }[],
	contribution: number,
	ctx: CalculationContext,
): void {
	const total = ctx.money.sum([
		...positions.map((p) => ctx.money.units(p.value ?? 0)),
		ctx.money.units(contribution),
	]);
	requireInput(
		total <= ctx.money.maximumUnits,
		"Portfolio plus contribution exceeds the configured wealth limit",
	);
}
export function validatePositions(
	positions: unknown,
	ctx: CalculationContext,
): asserts positions is AllocationPosition[] {
	requireInput(
		Array.isArray(positions) &&
			positions.length <= ctx.configuration.limits.holdings,
		"Positions exceed the configured holding capacity",
	);
	for (const p of positions) {
		requireShape(p, ["assetClass", "value"], "Allocation position");
		text(p.assetClass, "Asset class", ctx);
		ctx.money.requireMoney(p.value, "Position value");
	}
	checkWealth(positions, 0, ctx);
}
export function validateHoldings(
	holdings: unknown,
	ctx: CalculationContext,
): asserts holdings is Holding[] {
	requireInput(
		Array.isArray(holdings) &&
			holdings.length > 0 &&
			holdings.length <= ctx.configuration.limits.holdings,
		"Holdings exceed the configured capacity or are empty",
	);
	const ids = new Set<string>();
	for (const h of holdings) {
		requireShape(
			h,
			["holdingId", "depotId", "assetClass", "value", "currency"],
			"Holding",
		);
		text(h.holdingId, "Holding ID", ctx);
		text(h.depotId, "Depot ID", ctx);
		text(h.assetClass, "Asset class", ctx);
		text(h.currency, "Currency identifier", ctx);
		requireInput(!ids.has(h.holdingId), "Holding IDs must be unique");
		ids.add(h.holdingId);
		if (h.value !== null) ctx.money.requireMoney(h.value, "Holding value");
	}
}

export function checkClasses(
	positions: readonly { assetClass: string }[],
	policy: AllocationPolicy,
	ctx: CalculationContext,
	extra: string[] = [],
): void {
	requireInput(
		new Set([
			...positions.map((p) => p.assetClass),
			...Object.keys(policy),
			...extra,
		]).size <= ctx.configuration.limits.assetClasses,
		"Portfolio exceeds the configured class capacity",
	);
}
