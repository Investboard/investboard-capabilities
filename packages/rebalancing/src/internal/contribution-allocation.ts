interface AllocationEntry {
	assetClass: string;
	value: number;
	targetPercent: number;
}

/** Allocate NET new capital against the POST-contribution denominator.
 * Positive shortfalls sum to at least the budget for a complete target. When
 * sales would be needed, scale those shortfalls down: buy-only partial progress.
 * Largest remainders reconcile minor units; skipped minimums remain unallocated.
 */
export function allocateContribution(
	allocation: readonly Pick<
		AllocationEntry,
		"assetClass" | "value" | "targetPercent"
	>[],
	contribution: number,
	minimumAllocation: number,
	cashFloor: number,
	cashAssetClass: string,
): { assetClass: string; proportion: number; amount: number }[] {
	const total = allocation.reduce((sum, a) => sum + a.value, 0);
	const targetTotal = allocation.reduce((sum, a) => sum + a.targetPercent, 0);
	if (
		!Number.isFinite(contribution) ||
		contribution <= 0 ||
		!Number.isFinite(total) ||
		total < 0 ||
		Math.abs(targetTotal - 1) > 1e-9 ||
		allocation.some(
			(a) =>
				!Number.isFinite(a.value) ||
				a.value < 0 ||
				!Number.isFinite(a.targetPercent) ||
				a.targetPercent < 0 ||
				a.targetPercent > 1,
		)
	)
		return [];
	const grossBudget = contribution;
	const currentCash = allocation
		.filter((a) => a.assetClass === cashAssetClass)
		.reduce((s, a) => s + a.value, 0);
	const reserveUnits = Math.min(
		grossBudget,
		Math.max(0, cashFloor - currentCash),
	);
	const budget = grossBudget - reserveUnits;
	if (budget <= 0) return [];
	const postTotal = total + grossBudget;
	const needs = allocation
		.map((a) => ({
			assetClass: a.assetClass,
			need: Math.max(
				0,
				(a.targetPercent / targetTotal) * postTotal -
					a.value -
					(a.assetClass === cashAssetClass ? reserveUnits : 0),
			),
		}))
		.filter((a) => a.need > 0);
	const sum = needs.reduce((s, a) => s + a.need, 0);
	if (!(sum > 0)) return [];
	const items = needs.map((a) => {
		const raw = budget * (a.need / sum);
		return { ...a, units: Math.floor(raw), remainder: raw - Math.floor(raw) };
	});
	let left = budget - items.reduce((s, a) => s + a.units, 0);
	const ranked = [...items].sort((a, b) => b.remainder - a.remainder);
	// Reconcile in both directions: floating weights can cross a unit boundary
	// for large, still exactly representable portfolios.
	for (let i = 0; left > 0; i++, left--) ranked[i % ranked.length]!.units++;
	for (let i = ranked.length - 1; left < 0; i--, left++) {
		const candidate =
			ranked[((i % ranked.length) + ranked.length) % ranked.length]!;
		if (candidate.units > 0) candidate.units--;
		else left--;
	}
	return items
		.filter((a) => a.units > 0 && a.units >= minimumAllocation)
		.map((a) => ({
			assetClass: a.assetClass,
			proportion: a.units / grossBudget,
			amount: a.units,
		}));
}
