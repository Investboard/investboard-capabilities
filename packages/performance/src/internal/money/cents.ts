// Copyright 2026 Investboard GmbH. SPDX-License-Identifier: Apache-2.0
// Two-decimal reporting units. Symmetric half-away-from-zero rounding.
export type Cents = number & { readonly __brand: "Cents" };
export function asCents(value: number): Cents {
	if (!Number.isSafeInteger(value)) throw new RangeError("Unsafe cent amount");
	return value as Cents;
}
export function fromEuros(value: number): Cents {
	const scaled = Number((value * 100).toFixed(4));
	return asCents(scaled < 0 ? -Math.round(-scaled) : Math.round(scaled));
}
export function toEuros(value: Cents): number {
	return value / 100;
}
/** Normalize a reporting-currency total at a monetary boundary. */
export function roundMoney(value: number): number {
	return toEuros(fromEuros(value));
}
export function sumCents(values: Cents[]): Cents {
	return asCents(values.reduce((sum, value) => sum + value, 0));
}
