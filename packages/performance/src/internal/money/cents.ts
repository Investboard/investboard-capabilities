// Copyright 2026 Investboard GmbH. SPDX-License-Identifier: Apache-2.0
// Two-decimal reporting units. Symmetric half-away-from-zero rounding.
export type Cents = number & { readonly __brand: "Cents" };
export function asCents(value: number): Cents {
	if (!Number.isSafeInteger(value)) throw new RangeError("Unsafe cent amount");
	return value as Cents;
}
/** `noiseScale` is the magnitude, in reporting-currency units, whose binary
 * representation error the value may carry; it defaults to the value itself. */
export function fromEuros(value: number, noiseScale = 0): Cents {
	const scaled = value * 100;
	const magnitude = Math.abs(scaled);
	const half = Math.floor(magnitude) + 0.5;
	// Correct binary noise at a half-cent without rounding genuine sub-cent
	// evidence first. The cap keeps exact integers outside the correction zone.
	const tolerance = Math.min(
		0.25,
		Number.EPSILON * Math.max(1, magnitude, Math.abs(noiseScale) * 100),
	);
	const corrected = Math.abs(magnitude - half) <= tolerance ? half : magnitude;
	const rounded = Math.round(corrected);
	return asCents(scaled < 0 ? -rounded : rounded);
}
export function toEuros(value: Cents): number {
	return value / 100;
}
/** Normalize a reporting-currency total at a monetary boundary. */
export function roundMoney(value: number): number {
	return toEuros(fromEuros(value));
}
/** Preserve raw precision and small net amounts before rounding the total once.
 * Each addend carries its own representation error into the net, so a
 * half-cent tie is judged against the addends' combined magnitude: +100.005
 * and -99 net to 1.01, not 1.00. `"total"` judges it against the net alone,
 * the rule of methodology v3, kept for its replay. */
export function sumMoneyToCents(
	values: readonly number[],
	noise: "addends" | "total" = "addends",
): Cents {
	let total = 0;
	let correction = 0;
	let scale = 0;
	for (const value of values) {
		scale += Math.abs(value);
		const next = total + value;
		correction +=
			Math.abs(total) >= Math.abs(value)
				? total - next + value
				: value - next + total;
		total = next;
	}
	return fromEuros(total + correction, noise === "addends" ? scale : 0);
}
export function sumMoney(values: readonly number[]): number {
	return toEuros(sumMoneyToCents(values));
}
export function sumCents(values: Cents[]): Cents {
	return asCents(values.reduce((sum, value) => sum + value, 0));
}
