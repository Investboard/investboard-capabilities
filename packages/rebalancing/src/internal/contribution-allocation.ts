interface AllocationEntry {
	assetClass: string;
	value: number;
	targetPercent: number;
}

/** Allocate NET new capital against the POST-contribution denominator.
 * Positive shortfalls sum to at least the budget for a complete target. When
 * sales would be needed, scale those shortfalls down: buy-only partial progress.
 * Largest remainders reconcile cents; skipped minimums remain unallocated.
 */
export function allocateContribution(
	allocation: readonly Pick<
		AllocationEntry,
		"assetClass" | "value" | "targetPercent"
	>[],
	contribution: number,
	minimumAllocation = 0,
	cashFloor = 0,
): { assetClass: string; proportion: number; amount: number }[] {
	const total = allocation.reduce((sum, a) => sum + a.value, 0);
	const targetTotal = allocation.reduce((sum, a) => sum + a.targetPercent, 0);
	if (
		!Number.isFinite(contribution) ||
		contribution <= 0 ||
		!Number.isFinite(total) ||
		total < 0 ||
		Math.abs(targetTotal - 1) > 1e-3 ||
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
	const grossBudget = Math.round(contribution * 100);
	const currentCash = allocation
		.filter((a) => a.assetClass === "cash")
		.reduce((s, a) => s + Math.round(a.value * 100), 0);
	const reserveCents = Math.min(
		grossBudget,
		Math.max(0, Math.round(cashFloor * 100) - currentCash),
	);
	const budget = grossBudget - reserveCents;
	if (budget <= 0) return [];
	const postTotal = total + grossBudget / 100;
	const needs = allocation
		.map((a) => ({
			assetClass: a.assetClass,
			need: Math.max(
				0,
				(a.targetPercent / targetTotal) * postTotal -
					a.value -
					(a.assetClass === "cash" ? reserveCents / 100 : 0),
			),
		}))
		.filter((a) => a.need > 1e-9);
	const sum = needs.reduce((s, a) => s + a.need, 0);
	if (!(sum > 0)) return [];
	const items = needs.map((a) => {
		const raw = (budget * a.need) / sum;
		return { ...a, cents: Math.floor(raw), remainder: raw - Math.floor(raw) };
	});
	let left = budget - items.reduce((s, a) => s + a.cents, 0);
	for (const a of [...items].sort((a, b) => b.remainder - a.remainder)) {
		if (left-- <= 0) break;
		a.cents++;
	}
	return items
		.filter((a) => a.cents > 0 && a.cents / 100 >= minimumAllocation)
		.map((a) => ({
			assetClass: a.assetClass,
			proportion: a.cents / grossBudget,
			amount: a.cents / 100,
		}));
}
