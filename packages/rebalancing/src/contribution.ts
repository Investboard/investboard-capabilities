import { pooledCashRelease } from "./internal/cash-funding.js";
import type { AllocationRequest, ContributionResult } from "./types.js";
import type { CalculationContext } from "./configuration.js";
import { validateAllocation } from "./validation.js";
import {
	type Consolidation,
	splitContribution,
} from "./internal/contribution-allocation.js";
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
	return planConsolidated(input, ctx, applyOrderLimit).result;
}

/**
 * The plan plus `blockedUnits`: money meant for orders that no order could
 * take under the consolidation rule's per-class minimums (zero without one).
 */
export function planConsolidated(
	input: AllocationRequest,
	ctx: CalculationContext,
	applyOrderLimit: boolean,
	consolidation?: Consolidation,
): { result: ContributionResult; blockedUnits: number } {
	const { money, configuration } = ctx;
	const rows = allocationRows(input.positions, input.policy, ctx);
	const released =
		input.cashDeployment === "deploy_excess"
			? pooledCashRelease(input.positions, input.cashFloor ?? 0, ctx)
			: 0;
	const adjusted = rows.map((row) => ({
		...row,
		value: money.amount(
			money.units(row.value) -
				(row.assetClass === configuration.cashAssetClass ? released : 0),
		),
	}));
	const budget = money.sum([money.units(input.contribution), released]);
	const split = splitContribution(
		adjusted.map((row) => ({
			assetClass: row.assetClass,
			value: money.units(row.value),
			targetPercent: row.target,
		})),
		budget,
		money.units(input.minTradeSize ?? money.quantum),
		money.units(input.cashFloor ?? 0),
		configuration.cashAssetClass,
		consolidation,
	);
	const candidates = split.allocations
		.filter((a) => a.assetClass !== configuration.cashAssetClass)
		.sort(largestAllocationFirst);
	const selected = applyOrderLimit
		? candidates.slice(0, input.maxTrades ?? configuration.limits.orders)
		: candidates;
	const allocated = money.sum(selected.map((a) => a.amount));
	const result: ContributionResult = {
		existingCashReleased: money.amount(released),
		allocations: selected.map((a) => ({
			...a,
			amount: money.amount(a.amount),
		})),
		retainedCash: money.amount(budget - allocated),
		postContributionValue: money.amount(
			money.sum([
				...rows.map((row) => money.units(row.value)),
				money.units(input.contribution),
			]),
		),
	};
	return { result, blockedUnits: split.blocked };
}

/** Security allocations; reserve, target cash and skipped orders remain cash. */
export function allocateContribution(
	input: AllocationRequest,
): ContributionResult {
	const ctx = validateAllocation(input);
	return planContribution(input, ctx);
}
