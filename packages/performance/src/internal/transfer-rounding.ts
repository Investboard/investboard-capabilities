import { asCents, sumCents, sumMoneyToCents, toEuros } from "./money/cents.js";

/** Round a signed transfer total once and allocate its cent grain. The input
 * order resolves equal remainders; callers supply stable effect-ID order. */
export function allocateTransferRounding(amounts: readonly number[]): number[] {
	// The funding target comes from the original amounts, never rounded parts.
	const target = sumMoneyToCents(amounts);
	const parts = amounts.map((amount, index) => {
		const raw = amount * 100;
		const cents = asCents(Math.floor(raw));
		return { index, cents, remainder: raw - cents };
	});
	const grain = target - sumCents(parts.map((part) => part.cents));
	if (grain < 0 || grain > parts.length)
		throw new RangeError(
			"Transfer total cannot be allocated at cent precision",
		);
	const ranked = [...parts].sort((a, b) =>
		a.remainder === b.remainder
			? a.index - b.index
			: a.remainder > b.remainder
				? -1
				: 1,
	);
	for (let index = 0; index < grain; index++) {
		const part = ranked[index]!;
		part.cents = asCents(part.cents + 1);
	}
	return parts.map((part) => toEuros(part.cents));
}
