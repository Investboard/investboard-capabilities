interface AllocationEntry {
	assetClass: string;
	value: number;
	targetPercent: number;
}
type Row = Pick<AllocationEntry, "assetClass" | "value" | "targetPercent">;
type Allocation = { assetClass: string; proportion: number; amount: number };
interface Need {
	assetClass: string;
	need: number;
}
interface Share extends Need {
	units: number;
}

/**
 * Per-class order minimums (minor units) under which shares are consolidated.
 * The cash share is retained, never an order, so no minimum applies to it.
 */
export interface Consolidation {
	minimumFor: (assetClass: string) => number;
}

/** Split a budget by need; largest remainders reconcile minor units. */
function splitByNeed(budget: number, needs: readonly Need[]): Share[] {
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
	return items.map(({ remainder: _remainder, ...share }) => share);
}

/**
 * Shares below their class minimum are consolidated: the stranded share with
 * the smallest need leaves (on equal need, the later class name) and the
 * budget is split again over the rest, until every share meets its minimum or
 * no class is left. Shares only grow as classes leave. The consolidated split
 * replaces the plain one only when it does not move the book further from
 * target (sum of absolute deviations, retained money counted as cash).
 */
function consolidate(
	first: Share[],
	needs: readonly Need[],
	budget: number,
	distance: (shares: readonly Share[]) => number,
	meets: (share: Share) => boolean,
): Share[] {
	const stranded = (items: readonly Share[]) =>
		items.some((a) => a.units > 0 && !meets(a));
	const plain = first.filter(meets);
	if (!stranded(first)) return plain;
	let items = first;
	let pool = [...needs];
	while (pool.length > 0 && stranded(items)) {
		const leave = items
			.filter((a) => a.units > 0 && !meets(a))
			.sort(
				(a, b) =>
					a.need - b.need ||
					(a.assetClass < b.assetClass
						? 1
						: a.assetClass > b.assetClass
							? -1
							: 0),
			)[0]!;
		pool = pool.filter((a) => a.assetClass !== leave.assetClass);
		items = splitByNeed(budget, pool);
	}
	const consolidated = items.filter(meets);
	return distance(consolidated) <= distance(plain) + 1e-6
		? consolidated
		: plain;
}

/** Allocate NET new capital against the POST-contribution denominator.
 * Positive shortfalls sum to at least the budget for a complete target. When
 * sales would be needed, scale those shortfalls down: buy-only partial progress.
 * Largest remainders reconcile minor units; skipped minimums remain unallocated.
 */
export function allocateContribution(
	allocation: readonly Row[],
	contribution: number,
	minimumAllocation: number,
	cashFloor: number,
	cashAssetClass: string,
): Allocation[] {
	return splitContribution(
		allocation,
		contribution,
		minimumAllocation,
		cashFloor,
		cashAssetClass,
	).allocations;
}

/**
 * `allocateContribution`, optionally consolidating shares below per-class
 * minimums. `blocked` is the budget meant for orders that no order could take
 * after consolidation; the reserve top-up and a target cash share are
 * retained, never blocked. Without a consolidation rule, shares below
 * `minimumAllocation` are skipped and `blocked` stays zero.
 */
export function splitContribution(
	allocation: readonly Row[],
	contribution: number,
	minimumAllocation: number,
	cashFloor: number,
	cashAssetClass: string,
	consolidation?: Consolidation,
): { allocations: Allocation[]; blocked: number } {
	const none = { allocations: [], blocked: 0 };
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
		return none;
	const grossBudget = contribution;
	const currentCash = allocation
		.filter((a) => a.assetClass === cashAssetClass)
		.reduce((s, a) => s + a.value, 0);
	const reserveUnits = Math.min(
		grossBudget,
		Math.max(0, cashFloor - currentCash),
	);
	const budget = grossBudget - reserveUnits;
	if (budget <= 0) return none;
	const postTotal = total + grossBudget;
	const targetOf = (a: Row) => (a.targetPercent / targetTotal) * postTotal;
	const needs = allocation
		.map((a) => ({
			assetClass: a.assetClass,
			need: Math.max(
				0,
				targetOf(a) -
					a.value -
					(a.assetClass === cashAssetClass ? reserveUnits : 0),
			),
		}))
		.filter((a) => a.need > 0);
	const first = splitByNeed(budget, needs);
	if (first.length === 0) return none;
	const toAllocation = (a: Share) => ({
		assetClass: a.assetClass,
		proportion: a.units / grossBudget,
		amount: a.units,
	});
	if (!consolidation)
		return {
			allocations: first
				.filter((a) => a.units > 0 && a.units >= minimumAllocation)
				.map(toAllocation),
			blocked: 0,
		};
	const minimum = (assetClass: string) =>
		assetClass === cashAssetClass ? 0 : consolidation.minimumFor(assetClass);
	const meets = (a: Share) => a.units > 0 && a.units >= minimum(a.assetClass);
	const distance = (shares: readonly Share[]) => {
		const added = new Map(shares.map((s) => [s.assetClass, s.units]));
		const retained =
			grossBudget -
			shares.reduce(
				(s, a) => s + (a.assetClass === cashAssetClass ? 0 : a.units),
				0,
			);
		let cashRow = false;
		let d = 0;
		for (const a of allocation) {
			const isCash = a.assetClass === cashAssetClass;
			cashRow ||= isCash;
			d += Math.abs(
				a.value +
					(isCash ? retained : (added.get(a.assetClass) ?? 0)) -
					targetOf(a),
			);
		}
		return d + (cashRow ? 0 : retained);
	};
	const shares = consolidate(first, needs, budget, distance, meets);
	return {
		allocations: shares.map(toAllocation),
		blocked: budget - shares.reduce((s, a) => s + a.units, 0),
	};
}
