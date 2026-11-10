import { asCents, toEuros } from "./money/cents.js";

/** Round a signed transfer total once and allocate its cent grain. The input
 * order resolves equal remainders; callers supply stable effect-ID order. */
export function allocateTransferRounding(amounts: readonly number[]): number[] {
	const precision = 10_000n;
	// Match the money helper's correction of floating-point half-cent noise.
	const parts = amounts.map((amount, index) => {
		const raw = BigInt((amount * 100).toFixed(4).replace(".", ""));
		const floor =
			raw / precision - (raw < 0 && raw % precision !== 0n ? 1n : 0n);
		return { index, raw, cents: floor, remainder: raw - floor * precision };
	});
	const rawTotal = parts.reduce((sum, part) => sum + part.raw, 0n);
	const magnitude = rawTotal < 0 ? -rawTotal : rawTotal;
	const rounded = (magnitude + precision / 2n) / precision;
	const target = rawTotal < 0 ? -rounded : rounded;
	const grain = Number(
		target - parts.reduce((sum, part) => sum + part.cents, 0n),
	);
	const ranked = [...parts].sort((a, b) =>
		a.remainder === b.remainder
			? a.index - b.index
			: a.remainder > b.remainder
				? -1
				: 1,
	);
	for (let index = 0; index < grain; index++) ranked[index]!.cents++;
	return parts.map((part) => toEuros(asCents(Number(part.cents))));
}
