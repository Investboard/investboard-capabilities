import { calculateTwr } from "./internal/performance/twr.js";
import { calculateXirr } from "./internal/performance/xirr.js";
import { calculateHoldingAttribution } from "./internal/performance/holding-attribution.js";
import { aggregateCurrencyAttribution } from "./internal/performance/currency-attribution.js";
import {
	attributionCoverage,
	firstUnlinkedCapitalDate,
} from "./internal/attribution-coverage.js";
import { estimateHistoricalFundCosts } from "./internal/historical-fee-estimate.js";
import { prepareHistory, valueTransfers } from "./history.js";
import { buildWealthBridge } from "./wealth-bridge.js";
import { projectScope } from "./scope.js";
import {
	PerformanceInputError,
	requireInput,
	requireJson,
	shape,
	validateRequest,
} from "./validation.js";
import type {
	PerformanceRequest,
	PerformanceResult,
	PerformanceSnapshot,
	PerformanceReason,
} from "./types.js";

export type * from "./types.js";
export { PerformanceInputError } from "./validation.js";
export { LIMITS } from "./limits.js";
export const METHODOLOGY_VERSION = "actual-position-performance-v2" as const;

/** Pure, deterministic calculation. All monetary inputs share reporting currency. */
export function evaluatePerformance(
	input: PerformanceRequest,
): PerformanceResult {
	validateRequest(input);
	const original = structuredClone(input);
	const snapshot: PerformanceSnapshot = {
		methodologyVersion: METHODOLOGY_VERSION,
		request: original,
	};
	const reasons = new Set<PerformanceReason>();
	const unavailable = (reason: PerformanceReason): PerformanceResult => ({
		status: "unavailable",
		reportingCurrency: original.reportingCurrency,
		snapshot,
		calculation: null,
		reasonCodes: [...reasons, reason],
	});
	if (!original.ledgerComplete) return unavailable("incomplete_ledger");
	if (original.snapshots.length < 2) return unavailable("insufficient_history");
	const request = projectScope(original);
	if (!request) return unavailable("scope_history_missing");
	const history = prepareHistory(request);
	const transfers = valueTransfers(request, history);
	if (!transfers) return unavailable("transfer_valuation_missing");
	const flows = [...request.cashFlows, ...transfers.flows];
	const twr = calculateTwr([...request.snapshots], flows);
	if (twr.dataQuality === "undefined_subperiod")
		return unavailable("undefined_subperiod");
	const first = request.snapshots[0]!;
	const last = request.snapshots.at(-1)!;
	const mwr = calculateXirr(
		[
			{ date: first.date, amount: first.value, type: "buy" },
			...flows.filter(
				(flow) =>
					flow.date <= last.date &&
					(flow.date > first.date ||
						(flow.type === "dividend" && flow.date === first.date)),
			),
		],
		last.value,
		last.date,
	);
	const attribution = calculateHoldingAttribution({
		snapshots: request.snapshots,
		cashFlows: flows,
		holdings: history.series,
		reportingCurrency: request.reportingCurrency,
	});
	const unknownFrom = firstUnlinkedCapitalDate(
		flows.filter((f) => f.date >= first.date),
		last.date,
	);
	const coverage = attributionCoverage(
		request.snapshots,
		history.series,
		history.unknownDates,
		unknownFrom,
	);
	const costs = estimateHistoricalFundCosts(
		request.snapshots,
		history.series,
		new Map(request.positions.map((p) => [p.id, p.annualExpenseRatio ?? null])),
		history.evidence.filter((p) => p.status !== "not_held").length,
		unknownFrom,
	);
	if (
		history.evidence.some(
			(p) => p.source === "opening_balance" && p.status !== "not_held",
		)
	)
		reasons.add("opening_balance_inferred");
	if (history.evidence.some((p) => p.status === "excluded"))
		reasons.add("position_history_excluded");
	if (history.evidence.some((p) => p.missingValuationCount > 0))
		reasons.add("valuation_missing");
	if (!coverage.coverageKnown) reasons.add("coverage_unknown");
	else if (coverage.coveragePct < 100 - 1e-8)
		reasons.add("coverage_incomplete");
	if (unknownFrom) reasons.add("unlinked_capital");
	if (Math.abs(attribution.residualContribution) > 1e-8)
		reasons.add("unexplained_return");
	if (twr.maxCarryForwardDays > 7) reasons.add("sparse_snapshot_history");
	if (!costs.coverageKnown) reasons.add("fund_cost_coverage_unknown");
	else if (costs.coverage < 1 - 1e-10)
		reasons.add("fund_cost_coverage_incomplete");
	if (mwr.mwrError) reasons.add("money_weighted_return_unavailable");
	const wealthBridge = buildWealthBridge(request, history, flows);
	if (wealthBridge.unvaluedIntervalCount > 0)
		reasons.add("wealth_bridge_incomplete");
	const result: PerformanceResult = {
		status: reasons.size > 0 ? "partial" : "available",
		reportingCurrency: request.reportingCurrency,
		snapshot,
		reasonCodes: [...reasons],
		calculation: {
			scope: {
				holdingIds: request.positions.map((p) => p.id),
				navBasis: original.scopeHoldingIds ? "reconstructed" : "supplied",
			},
			window: { from: first.date, to: last.date },
			timeWeightedReturn: twr,
			moneyWeightedReturn: mwr,
			attribution,
			currencyAttribution: aggregateCurrencyAttribution({
				holdings: attribution.holdings,
				classifications: request.positions.map((p) => ({
					holdingId: p.id,
					currency: p.quoteCurrency,
				})),
			}),
			coverage: {
				fraction: coverage.coverageKnown ? coverage.coveragePct / 100 : null,
				basis: "historical_capital_days",
			},
			fundCostEstimate: {
				amount: costs.fundCosts,
				currency: request.reportingCurrency,
				coverageFraction: costs.coverageKnown ? costs.coverage : null,
				basis: "current_recorded_rates_historical_positions",
				confidence:
					!costs.coverageKnown || costs.coverage === 0
						? null
						: costs.coverage >= 0.9
							? "medium"
							: "low",
				deductedFromReturn: false,
			},
			wealthBridge,
			positions: history.evidence,
			replay: history.replay,
			transfers: transfers.valuations,
		},
	};
	// Never publish a JSON snapshot whose non-finite result would serialize to null.
	try {
		requireJson(result.calculation, 4_000_000);
	} catch {
		throw new PerformanceInputError(
			"Calculated output exceeds supported numeric or structural limits",
		);
	}
	return result;
}

export function replayPerformance(
	snapshot: PerformanceSnapshot,
): PerformanceResult {
	requireJson(snapshot);
	shape(snapshot, ["methodologyVersion", "request"], "Snapshot");
	requireInput(
		snapshot.methodologyVersion === METHODOLOGY_VERSION,
		"Unsupported snapshot methodology",
	);
	return evaluatePerformance(snapshot.request);
}
