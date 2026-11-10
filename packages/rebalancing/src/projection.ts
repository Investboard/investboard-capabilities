import type {
	AllocationPosition,
	ContributionProjection,
	ProjectionMonth,
	ProjectionRequest,
} from "./types.js";
import { validateProjection } from "./validation.js";
import { planContribution } from "./contribution.js";
import { allocationRows, classValues } from "./internal/allocation.js";
import { MAX_SUPPORTED_WEALTH, toCents } from "./internal/money.js";
import { requireInput } from "./internal/input-guards.js";

/** Pooled class projection: explicit returns, no broker fees, transfers or cash sweeps. */
export function projectContributions(
	input: ProjectionRequest,
): ContributionProjection {
	validateProjection(input);
	const request = structuredClone(input);
	let values = classValues(request.positions);
	const timeline: ProjectionMonth[] = [];
	for (let month = 1; month <= request.months; month++) {
		for (const [assetClass, value] of values)
			values.set(
				assetClass,
				Math.round(
					value * (1 + request.annualReturns[assetClass]!) ** (1 / 12),
				),
			);
		const grown = [...values.values()].reduce((sum, value) => sum + value, 0);
		requireInput(
			Number.isSafeInteger(grown) &&
				grown + toCents(request.monthlyContribution) <=
					MAX_SUPPORTED_WEALTH * 100,
			"Projected wealth exceeds the supported limit",
		);
		const positions: AllocationPosition[] = [...values].map(
			([assetClass, value]) => ({ assetClass, value: value / 100 }),
		);
		const next = planContribution({
			positions,
			policy: request.policy,
			contribution: request.monthlyContribution,
			cashFloor: request.cashFloor ?? 0,
			minTradeSize: request.minTradeSize ?? 0.01,
			maxTrades: request.maxTrades ?? 100,
		});
		for (const a of next.allocations)
			values.set(
				a.assetClass,
				(values.get(a.assetClass) ?? 0) + toCents(a.amount),
			);
		values.set("cash", (values.get("cash") ?? 0) + toCents(next.retainedCash));
		const after = [...values]
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([assetClass, value]) => ({ assetClass, value: value / 100 }));
		timeline.push({
			month,
			value: next.postContributionValue,
			retainedCash: next.retainedCash,
			allocations: next.allocations,
			positions: after,
			rows: allocationRows(after, request.policy),
		});
		values = classValues(after);
	}
	return {
		methodologyVersion: "contribution-projection-v1",
		request: structuredClone(request),
		timeline,
	};
}
