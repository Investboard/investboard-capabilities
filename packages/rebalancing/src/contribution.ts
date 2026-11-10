import type { AllocationRequest, ContributionResult } from "./types.js";
import { validateAllocation } from "./validation.js";
import { allocateContribution as allocate } from "./internal/contribution-allocation.js";
import {
	allocationRows,
	largestAllocationFirst,
} from "./internal/allocation.js";
import { toCents } from "./internal/money.js";

/** Internal callers validate their complete request once at the public boundary. */
export function planContribution(input: AllocationRequest): ContributionResult {
	const rows = allocationRows(input.positions, input.policy);
	const allocations = allocate(
		rows.map((row) => ({
			assetClass: row.assetClass,
			value: row.value,
			targetPercent: row.target,
		})),
		input.contribution,
		input.minTradeSize ?? 0.01,
		input.cashFloor ?? 0,
	)
		.filter((a) => a.assetClass !== "cash")
		.sort(largestAllocationFirst)
		.slice(0, input.maxTrades ?? 100);
	return {
		allocations,
		retainedCash:
			(toCents(input.contribution) -
				allocations.reduce((sum, a) => sum + toCents(a.amount), 0)) /
			100,
		postContributionValue:
			(rows.reduce((sum, row) => sum + toCents(row.value), 0) +
				toCents(input.contribution)) /
			100,
	};
}

/** Security allocation amounts; all reserve, target cash and skipped orders remain cash. */
export function allocateContribution(
	input: AllocationRequest,
): ContributionResult {
	validateAllocation(input);
	return planContribution(input);
}
