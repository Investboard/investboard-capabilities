import type {
	RebalanceComparison,
	RebalanceRequest,
	RebalanceSnapshot,
	ReasonCode,
} from "./types.js";
import { validateRequest } from "./validation.js";
import {
	requireInput,
	requireJson,
	requireShape,
} from "./internal/input-guards.js";
import { allocationRows } from "./internal/allocation.js";
import { cashPurchases } from "./internal/cash-plan.js";
import { assess, unavailable } from "./internal/assess.js";
import { toCents } from "./internal/money.js";

export type * from "./types.js";
export { MAX_SUPPORTED_WEALTH } from "./internal/money.js";
export { RebalanceInputError } from "./validation.js";
export { allocateContribution } from "./contribution.js";
export { projectContributions } from "./projection.js";
export const METHODOLOGY_VERSION = "rebalance-comparison-v1" as const;

/** Compare one reporting-currency book without providers, storage or order execution. */
export function compareRebalance(input: RebalanceRequest): RebalanceComparison {
	validateRequest(input);
	const request = structuredClone(input);
	const reasons: ReasonCode[] = [];
	if (request.holdings.some((h) => h.value === null))
		reasons.push("incomplete_valuation");
	if (request.holdings.some((h) => h.currency !== request.baseCurrency))
		reasons.push("currency_mismatch");
	const alternatives = reasons.length
		? [
				unavailable("keep", 0, reasons),
				unavailable("fresh_cash", request.contribution, reasons),
				unavailable("partial_cash", request.cashLimit, reasons),
				unavailable("sales", 0, reasons),
			]
		: [
				assess(request, "keep", 0, [], []),
				assess(
					request,
					"fresh_cash",
					request.contribution,
					[],
					cashPurchases(request, request.contribution),
				),
				assess(
					request,
					"partial_cash",
					request.cashLimit,
					[],
					cashPurchases(request, request.cashLimit),
				),
				request.salePlan
					? assess(
							request,
							"sales",
							0,
							request.salePlan.sales,
							request.salePlan.purchases,
						)
					: unavailable("sales", 0, ["sale_plan_required"]),
			];
	const priority = request.priority ?? "minimize_sales";
	if (priority === "target_alignment")
		alternatives.sort(
			(a, b) =>
				Number(a.feasibility === "unavailable") -
					Number(b.feasibility === "unavailable") ||
				(a.residualDrift ?? Infinity) - (b.residualDrift ?? Infinity),
		);
	return {
		methodologyVersion: METHODOLOGY_VERSION,
		baseCurrency: request.baseCurrency,
		priority,
		valueBefore: reasons.length
			? null
			: request.holdings.reduce((sum, h) => sum + toCents(h.value ?? 0), 0) /
				100,
		rowsBefore: reasons.length
			? null
			: allocationRows(
					request.holdings.map((h) => ({
						assetClass: h.assetClass,
						value: h.value ?? 0,
					})),
					request.policy,
				),
		alternatives,
		snapshot: {
			methodologyVersion: METHODOLOGY_VERSION,
			request: structuredClone(request),
		},
	};
}

/** Replay the original assumptions. Snapshots are JSON data, not signed attestations. */
export function replayRebalanceComparison(
	snapshot: RebalanceSnapshot,
): RebalanceComparison {
	requireJson(snapshot);
	requireShape(snapshot, ["methodologyVersion", "request"], "Snapshot");
	requireInput(
		snapshot.methodologyVersion === METHODOLOGY_VERSION,
		"Unsupported snapshot methodology",
	);
	return compareRebalance(snapshot.request);
}
