import { releaseCash } from "./internal/cash-funding.js";
import type {
	ComparisonMethodology,
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
export const METHODOLOGY_VERSION = "rebalance-comparison-v5" as const;
const LEGACY_METHODOLOGY = "rebalance-comparison-v4" as const;

/** Compare caller-selected scenarios for one reporting-currency book. */
export function compareRebalance(input: RebalanceRequest): RebalanceComparison {
	return compare(input, METHODOLOGY_VERSION);
}

function compare(
	input: RebalanceRequest,
	methodologyVersion: ComparisonMethodology,
): RebalanceComparison {
	const ctx = validateRequest(input);
	const legacy = methodologyVersion === LEGACY_METHODOLOGY;
	requireInput(
		!legacy ||
			input.holdings.every(
				(h) => !Object.hasOwn(h, "fund") && !Object.hasOwn(h, "priced"),
			),
		"Holding fund and price declarations require rebalance-comparison-v5",
	);
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
				return assess(scope, scenario.kind, 0, [], [], ctx, [], { legacy });
			case "contribution": {
				const cash = releaseCash(scope, [], ctx);
				const generated = cashPurchases(scope, externalCash, ctx, cash, legacy);
				return assess(
					scope,
					scenario.kind,
					externalCash,
					[],
					generated.purchases,
					ctx,
					cash,
					{
						legacy,
						uninvested: {
							units: generated.uninvestedUnits,
							reasons: generated.reasons,
						},
					},
				);
			}
			case "plan":
				return assess(
					scope,
					scenario.kind,
					externalCash,
					scenario.plan.sales,
					scenario.plan.purchases,
					ctx,
					releaseCash(scope, scenario.plan.sales, ctx),
					{ legacy },
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
		methodologyVersion,
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
			methodologyVersion,
			request: structuredClone(request),
		},
	};
}

/**
 * Replay original assumptions under the methodology they were saved with: a
 * v4 snapshot reproduces its v4 result. Snapshots are JSON data, not signed
 * attestations.
 */
export function replayRebalanceComparison(
	snapshot: RebalanceSnapshot,
): RebalanceComparison {
	requireShape(snapshot, ["methodologyVersion", "request"], "Snapshot");
	requireInput(
		snapshot.methodologyVersion === METHODOLOGY_VERSION ||
			snapshot.methodologyVersion === LEGACY_METHODOLOGY,
		"Unsupported snapshot methodology",
	);
	return compare(snapshot.request, snapshot.methodologyVersion);
}
