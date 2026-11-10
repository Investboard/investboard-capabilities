import type {
	ContributionProjection,
	ProjectionMonth,
	ProjectionRequest,
} from "./types.js";
import { validateProjection } from "./validation.js";
import { planContribution } from "./contribution.js";
import { allocationRows, classValues } from "./internal/allocation.js";
import { requireInput } from "./internal/input-guards.js";

/** Pooled class projection: explicit returns, no broker fees, transfers or cash sweeps. */
export function projectContributions(
	input: ProjectionRequest,
): ContributionProjection {
	const ctx = validateProjection(input);
	const { money, configuration } = ctx;
	const request = structuredClone(input);
	let values = classValues(request.positions, ctx);
	const timeline: ProjectionMonth[] = [];
	for (let month = 1; month <= request.months; month++) {
		for (const [assetClass, value] of values) {
			const grown = Math.round(
				value * (1 + request.annualReturns[assetClass]!) ** (1 / 12),
			);
			requireInput(
				Number.isSafeInteger(grown),
				"Projected value exceeds exact minor-unit precision",
			);
			values.set(assetClass, grown);
		}
		const total = money.sum([
			...values.values(),
			money.units(request.monthlyContribution),
		]);
		requireInput(
			total <= money.maximumUnits,
			"Projected wealth exceeds the configured limit",
		);
		const positions = [...values].map(([assetClass, value]) => ({
			assetClass,
			value: money.amount(value),
		}));
		const next = planContribution(
			{
				configuration,
				positions,
				policy: request.policy,
				contribution: request.monthlyContribution,
				cashFloor: request.cashFloor ?? 0,
				minTradeSize: request.minTradeSize ?? money.quantum,
				maxTrades: request.maxTrades ?? configuration.limits.orders,
			},
			ctx,
		);
		for (const a of next.allocations)
			values.set(
				a.assetClass,
				money.sum([values.get(a.assetClass) ?? 0, money.units(a.amount)]),
			);
		values.set(
			configuration.cashAssetClass,
			money.sum([
				values.get(configuration.cashAssetClass) ?? 0,
				money.units(next.retainedCash),
			]),
		);
		const after = [...values]
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([assetClass, value]) => ({
				assetClass,
				value: money.amount(value),
			}));
		timeline.push({
			month,
			value: next.postContributionValue,
			retainedCash: next.retainedCash,
			allocations: next.allocations,
			positions: after,
			rows: allocationRows(after, request.policy, ctx),
		});
		values = classValues(after, ctx);
	}
	return {
		methodologyVersion: "contribution-projection-v2",
		request: structuredClone(request),
		timeline,
	};
}
