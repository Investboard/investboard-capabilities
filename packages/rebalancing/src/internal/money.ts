import { requireInput } from "./input-guards.js";

/** Representation protection, not a portfolio limit. Leaves round-trip headroom. */
export const MAX_SAFE_MINOR_UNITS = Math.floor(Number.MAX_SAFE_INTEGER / 16);

export interface Money {
	units: (amount: number) => number;
	amount: (units: number) => number;
	sum: (values: Iterable<number>) => number;
	requireMoney: (value: unknown, label: string) => asserts value is number;
	maximumUnits: number;
	quantum: number;
}
export function createMoney(policy: {
	decimalPlaces: number;
	maximumAmount: number;
}): Money {
	const digits = policy.decimalPlaces;
	const units = (amount: number): number => {
		requireInput(
			Number.isFinite(amount) && Number(amount.toFixed(digits)) === amount,
			"Money must be finite and rounded to the configured precision",
		);
		const result = BigInt(amount.toFixed(digits).replace(".", ""));
		requireInput(
			result <= BigInt(MAX_SAFE_MINOR_UNITS) &&
				result >= -BigInt(MAX_SAFE_MINOR_UNITS),
			"Money exceeds exact minor-unit precision",
		);
		return Number(result);
	};
	const amount = (value: number): number => {
		requireInput(
			Number.isSafeInteger(value) && Math.abs(value) <= MAX_SAFE_MINOR_UNITS,
			"Aggregate exceeds exact minor-unit precision",
		);
		const sign = value < 0 ? "-" : "";
		const text = Math.abs(value)
			.toString()
			.padStart(digits + 1, "0");
		const output = Number(
			digits
				? `${sign}${text.slice(0, -digits)}.${text.slice(-digits)}`
				: `${sign}${text}`,
		);
		requireInput(
			units(output) === value,
			"Money cannot round-trip at the configured precision",
		);
		return output;
	};
	const sum = (values: Iterable<number>): number => {
		let total = 0n;
		for (const value of values) {
			requireInput(
				Number.isSafeInteger(value),
				"Minor-unit values must be exact integers",
			);
			total += BigInt(value);
		}
		requireInput(
			total <= BigInt(MAX_SAFE_MINOR_UNITS) &&
				total >= -BigInt(MAX_SAFE_MINOR_UNITS),
			"Aggregate exceeds exact minor-unit precision",
		);
		return Number(total);
	};
	function requireMoney(
		value: unknown,
		label: string,
	): asserts value is number {
		requireInput(
			typeof value === "number" && value >= 0 && value <= policy.maximumAmount,
			`${label} must be nonnegative money within the configured limit`,
		);
		units(value);
	}
	return {
		units,
		amount,
		sum,
		requireMoney,
		maximumUnits: units(policy.maximumAmount),
		quantum: amount(1),
	};
}
