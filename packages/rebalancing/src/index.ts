import type {
	RebalanceComparison,
	RebalanceRequest,
	RebalanceSnapshot,
	ReasonCode,
} from "./types.js";
import { validateRequest } from "./validation.js";
import { requireInput, requireShape } from "./internal/input-guards.js";
import { allocationRows } from "./internal/allocation.js";
import { cashPurchases } from "./internal/cash-plan.js";
import { assess, unavailable } from "./internal/assess.js";

export type * from "./types.js";
export { MAX_SAFE_MINOR_UNITS } from "./internal/money.js";
export { RebalanceInputError } from "./validation.js";
export { allocateContribution } from "./contribution.js";
export { projectContributions } from "./projection.js";
export const METHODOLOGY_VERSION = "rebalance-comparison-v3" as const;

/** Compare caller-selected scenarios for one reporting-currency book. */
export function compareRebalance(input: RebalanceRequest): RebalanceComparison {
	const ctx = validateRequest(input);
	const request = structuredClone(input);
	const reasons: ReasonCode[] = [];
	if (request.holdings.some((h) => h.value === null))
		reasons.push("incomplete_valuation");
	if (request.holdings.some((h) => h.currency !== request.baseCurrency))
		reasons.push("currency_mismatch");
	const alternatives = request.scenarios.map((scenario) => {
		const externalCash = "externalCash" in scenario ? scenario.externalCash : 0;
		if (scenario.mode === "unavailable")
			return unavailable(scenario.kind, 0, [
				...scenario.reasonCodes,
				...reasons,
			]);
		if (reasons.length)
			return unavailable(scenario.kind, externalCash, reasons);
		const scope =
			"fundingDepotId" in scenario
				? { ...request, fundingDepotId: scenario.fundingDepotId! }
				: request;
		switch (scenario.mode) {
			case "keep":
				return assess(scope, scenario.kind, 0, [], [], ctx);
			case "contribution":
				return assess(
					scope,
					scenario.kind,
					externalCash,
					[],
					cashPurchases(scope, externalCash, ctx),
					ctx,
				);
			case "plan":
				return assess(
					scope,
					scenario.kind,
					externalCash,
					scenario.plan.sales,
					scenario.plan.purchases,
					ctx,
				);
		}
	});
	const priority = request.priority ?? "input_order";
	if (priority === "target_alignment")
		alternatives.sort(
			(a, b) =>
				Number(a.feasibility === "unavailable") -
					Number(b.feasibility === "unavailable") ||
				(a.residualDrift ?? Infinity) - (b.residualDrift ?? Infinity),
		);
	if (priority === "minimize_sales")
		alternatives.sort(
			(a, b) =>
				Number(a.feasibility === "unavailable") -
					Number(b.feasibility === "unavailable") ||
				ctx.money.sum(a.sales.map((s) => ctx.money.units(s.amount))) -
					ctx.money.sum(b.sales.map((s) => ctx.money.units(s.amount))),
		);
	return {
		methodologyVersion: METHODOLOGY_VERSION,
		baseCurrency: request.baseCurrency,
		priority,
		valueBefore: reasons.length
			? null
			: ctx.money.amount(
					ctx.money.sum(
						request.holdings.map((h) => ctx.money.units(h.value ?? 0)),
					),
				),
		rowsBefore: reasons.length
			? null
			: allocationRows(
					request.holdings.map((h) => ({
						assetClass: h.assetClass,
						value: h.value ?? 0,
					})),
					request.policy,
					ctx,
				),
		alternatives,
		snapshot: {
			methodologyVersion: METHODOLOGY_VERSION,
			request: structuredClone(request),
		},
	};
}

/** Replay original assumptions. Snapshots are JSON data, not signed attestations. */
export function replayRebalanceComparison(
	snapshot: RebalanceSnapshot,
): RebalanceComparison {
	requireShape(snapshot, ["methodologyVersion", "request"], "Snapshot");
	requireInput(
		snapshot.methodologyVersion === METHODOLOGY_VERSION,
		"Unsupported snapshot methodology",
	);
	return compareRebalance(snapshot.request);
}
