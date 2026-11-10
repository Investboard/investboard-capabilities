import type { AllocationRequest, ContributionResult } from "./types.js";
import type { CalculationContext } from "./configuration.js";
import { validateAllocation } from "./validation.js";
import { allocateContribution as allocate } from "./internal/contribution-allocation.js";
import {
	allocationRows,
	largestAllocationFirst,
} from "./internal/allocation.js";

/** Internal callers validate their complete request once at the public boundary. */
export function planContribution(
	input: AllocationRequest,
	ctx: CalculationContext,
	applyOrderLimit = true,
): ContributionResult {
	const { money, configuration } = ctx;
	const rows = allocationRows(input.positions, input.policy, ctx);
	const candidates = allocate(
		rows.map((row) => ({
			assetClass: row.assetClass,
			value: money.units(row.value),
			targetPercent: row.target,
		})),
		money.units(input.contribution),
		money.units(input.minTradeSize ?? money.quantum),
		money.units(input.cashFloor ?? 0),
		configuration.cashAssetClass,
	)
		.filter((a) => a.assetClass !== configuration.cashAssetClass)
		.sort(largestAllocationFirst);
	const selected = applyOrderLimit
		? candidates.slice(0, input.maxTrades ?? configuration.limits.orders)
		: candidates;
	const allocated = money.sum(selected.map((a) => a.amount));
	return {
		allocations: selected.map((a) => ({
			...a,
			amount: money.amount(a.amount),
		})),
		retainedCash: money.amount(money.units(input.contribution) - allocated),
		postContributionValue: money.amount(
			money.sum([
				...rows.map((row) => money.units(row.value)),
				money.units(input.contribution),
			]),
		),
	};
}

/** Security allocations; reserve, target cash and skipped orders remain cash. */
export function allocateContribution(
	input: AllocationRequest,
): ContributionResult {
	const ctx = validateAllocation(input);
	return planContribution(input, ctx);
}
