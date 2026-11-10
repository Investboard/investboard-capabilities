import type {
	ContributionProjection,
	ProjectionPeriod,
	ProjectionRequest,
} from "./types.js";
import { validateProjection } from "./validation.js";
import { planContribution } from "./contribution.js";
import { allocationRows, classValues } from "./internal/allocation.js";
import { requireInput } from "./internal/input-guards.js";

/** Pooled period projection with explicit cadence, cash handling and return paths. */
export function projectContributions(
	input: ProjectionRequest,
): ContributionProjection {
	const ctx = validateProjection(input);
	const { money, configuration } = ctx;
	const request = structuredClone(input);
	let values = classValues(request.positions, ctx);
	const timeline: ProjectionPeriod[] = [];
	for (let period = 1; period <= request.periods; period++) {
		const returns = Array.isArray(request.annualReturns)
			? request.annualReturns[period - 1]!
			: request.annualReturns;
		const contribution = Array.isArray(request.contributions)
			? request.contributions[period - 1]!
			: request.contributions;
		for (const [assetClass, value] of values) {
			const grown = Math.round(
				value * (1 + returns[assetClass]!) ** (1 / request.periodsPerYear),
			);
			requireInput(
				Number.isSafeInteger(grown),
				"Projected value exceeds exact minor-unit precision",
			);
			values.set(assetClass, grown);
		}
		requireInput(
			money.sum([...values.values(), money.units(contribution)]) <=
				money.maximumUnits,
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
				contribution,
				cashDeployment:
					request.cashSweep === "reinvest_excess"
						? "deploy_excess"
						: "preserve",
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
				-money.units(next.existingCashReleased),
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
			period,
			contribution,
			existingCashReleased: next.existingCashReleased,
			value: next.postContributionValue,
			retainedCash: next.retainedCash,
			allocations: next.allocations,
			positions: after,
			rows: allocationRows(after, request.policy, ctx),
		});
		values = classValues(after, ctx);
	}
	return {
		methodologyVersion: "contribution-projection-v3",
		request: structuredClone(request),
		timeline,
	};
}
