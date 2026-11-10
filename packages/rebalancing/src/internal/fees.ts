import type { AccountRules, FeeSchedule, Purchase, Sale } from "../types.js";
import type { CalculationContext } from "../configuration.js";
import { requireInput } from "./input-guards.js";
import { MAX_SAFE_MINOR_UNITS } from "./money.js";

function rational(value: number): [bigint, bigint] {
	const [mantissa = "0", exponent = "0"] = value
		.toString()
		.toLowerCase()
		.split("e");
	const fraction = mantissa.split(".")[1]?.length ?? 0;
	const power = Number(exponent) - fraction;
	const digits = BigInt(mantissa.replace(".", ""));
	return power >= 0
		? [digits * 10n ** BigInt(power), 1n]
		: [digits, 10n ** BigInt(-power)];
}

function scheduleFee(
	schedule: FeeSchedule,
	amount: number,
	ctx: CalculationContext,
): number {
	const { money } = ctx;
	const [numerator, denominator] = rational(schedule.rate);
	const product = BigInt(money.units(amount)) * numerator;
	let variable = product / denominator;
	const remainder = product % denominator;
	if (
		(schedule.rounding === "up" && remainder > 0n) ||
		(schedule.rounding === "nearest" && remainder * 2n >= denominator)
	)
		variable++;
	let units = BigInt(money.units(schedule.fixed)) + variable;
	if (
		schedule.minimum !== undefined &&
		units < BigInt(money.units(schedule.minimum))
	)
		units = BigInt(money.units(schedule.minimum));
	if (
		schedule.maximum !== undefined &&
		units > BigInt(money.units(schedule.maximum))
	)
		units = BigInt(money.units(schedule.maximum));
	requireInput(
		units <= BigInt(MAX_SAFE_MINOR_UNITS),
		"Calculated fee exceeds exact minor-unit precision",
	);
	return Number(units);
}

/** Per-order overrides allow arbitrary external fee models while snapshots stay JSON. */
export function operationFee(
	operation: Purchase | Sale,
	side: "buy" | "sell",
	account: AccountRules | undefined,
	ctx: CalculationContext,
): number | null {
	if (Object.hasOwn(operation, "fee"))
		return operation.fee == null ? null : ctx.money.units(operation.fee);
	if (!account) return null;
	if (Object.hasOwn(account, "fees")) {
		const schedule = account.fees?.[side];
		return schedule == null
			? null
			: scheduleFee(schedule, operation.amount, ctx);
	}
	return account.feePerTrade == null
		? null
		: ctx.money.units(account.feePerTrade);
}
