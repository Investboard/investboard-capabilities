import type {
	PairRequest,
	PairResult,
	ResearchRequest,
	ResearchResult,
	Snapshot,
} from "./types.js";
import { validatePair, validateResearch } from "./validation.js";
import { fundamentals } from "./internal/fundamentals.js";
import { reportingHistory } from "./internal/fx.js";
import {
	historyMetrics,
	referenceCorrelation,
	windowPoints,
} from "./internal/analytics.js";
import { investmentReading } from "./internal/investment.js";
import { requireInput, requireJson, shape } from "./internal/input-guards.js";

export type * from "./types.js";
export { ResearchInputError } from "./validation.js";
export { LIMITS } from "./limits.js";
export const METHODOLOGY_VERSION = "instrument-research-v1" as const;

function finiteCalculation(value: unknown): void {
	if (typeof value === "number")
		requireInput(
			Number.isFinite(value),
			"Calculation exceeds finite numeric precision",
		);
	else if (value && typeof value === "object")
		for (const child of Object.values(value)) finiteCalculation(child);
}

export function evaluateInstrumentResearch(
	input: ResearchRequest,
): ResearchResult {
	validateResearch(input);
	const original = structuredClone(input);
	const request = structuredClone(original);
	const result: ResearchResult = {
		snapshot: { methodologyVersion: METHODOLOGY_VERSION, request: original },
		history: { metrics: null, investment: null, reasons: [] },
		fundamentals: { periods: [], reasons: [] },
		interpretation:
			"caller_supplied_retained_evidence_not_original_public_vintages",
	};
	if (request.vintage === "original_public") {
		result.history.reasons.push("original_public_vintages_unavailable");
		result.fundamentals.reasons.push("original_public_vintages_unavailable");
		return result;
	}
	result.fundamentals.periods = fundamentals(request);
	finiteCalculation(result.fundamentals);
	if (!result.fundamentals.periods.length)
		result.fundamentals.reasons.push("no_statement_periods");
	if (!request.history) {
		result.history.reasons.push("no_history");
		return result;
	}
	const history = request.history;
	const converted = reportingHistory(
		{
			...history,
			points: history.points.filter(
				(p) => p.date >= request.from && p.date <= request.to,
			),
		},
		request.reportingCurrency,
	);
	result.history.reasons.push(...converted.reasons);
	const metrics = historyMetrics(
		{ id: "instrument", basis: history.basis, points: converted.points },
		request.from,
		request.to,
	);
	result.history.metrics = metrics;
	result.history.reasons.push(...metrics.quality.reasons);
	if (history.basis === "price")
		result.history.reasons.push("price_return_excludes_distributions");
	if (request.investment && metrics.quality.availability === "available")
		result.history.investment = investmentReading(
			windowPoints(converted.points, request.from, request.to),
			request.investment,
		);
	else if (request.investment)
		result.history.reasons.push("investment_withheld_for_history_coverage");
	finiteCalculation(result.history);
	finiteCalculation(result.fundamentals);
	return result;
}

export function evaluateInstrumentPair(input: PairRequest): PairResult {
	validatePair(input);
	const request = structuredClone(input);
	const result: PairResult = {
		snapshot: { methodologyVersion: METHODOLOGY_VERSION, request },
		correlations: [],
		reasons: [],
		interpretation: "descriptive_pair_not_portfolio_risk",
	};
	if (request.vintage === "original_public") {
		result.reasons.push("original_public_vintages_unavailable");
		return result;
	}
	const series = request.series.map((history, index) => {
		const converted = reportingHistory(history, request.reportingCurrency);
		result.reasons.push(
			...converted.reasons.map((r) => `${index === 0 ? "left" : "right"}:${r}`),
		);
		return {
			id: index === 0 ? "left" : "right",
			basis: history.basis,
			points: converted.points,
		};
	});
	result.correlations = request.horizons.map((horizon) =>
		referenceCorrelation(
			series[0]!,
			series[1]!,
			horizon,
			request.reportingCurrency,
			request.asOf.slice(0, 10),
		),
	);
	finiteCalculation(result.correlations);
	return result;
}

function validateSnapshot(
	snapshot: unknown,
): asserts snapshot is Snapshot<unknown> {
	requireJson(snapshot);
	shape(snapshot, ["methodologyVersion", "request"], "Snapshot");
	requireInput(
		snapshot.methodologyVersion === METHODOLOGY_VERSION,
		"Unsupported snapshot methodology",
	);
}
export function replayInstrumentResearch(
	snapshot: Snapshot<ResearchRequest>,
): ResearchResult {
	validateSnapshot(snapshot);
	validateResearch(snapshot.request);
	return evaluateInstrumentResearch(snapshot.request);
}
export function replayInstrumentPair(
	snapshot: Snapshot<PairRequest>,
): PairResult {
	validateSnapshot(snapshot);
	validatePair(snapshot.request);
	return evaluateInstrumentPair(snapshot.request);
}
