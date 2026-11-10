import type {
	Basis as KnowledgeBasis,
	Correlation as KnowledgeCorrelation,
	HistoryMetrics as KnowledgePerformance,
	Point as KnowledgePoint,
	Quality as KnowledgeQuality,
} from "../types.js";
import { fisherInterval, pearson } from "./statistics.js";
import { calculateDrawdown } from "./drawdown.js";
import {
	dayNumber,
	orderedPoints,
	weeklyReturns,
	yearsBefore,
} from "./series.js";
export const KNOWLEDGE_METHOD = "reference-analytics-v1";
export const KNOWLEDGE_HORIZONS = [1, 3, 5, 10] as const;
export type ReferenceSeries = {
	id: string;
	basis: KnowledgeBasis;
	points: KnowledgePoint[];
};

export function seriesQuality(
	points: readonly KnowledgePoint[],
	from: string,
	to: string,
	maxGap = 7,
): KnowledgeQuality {
	const first = points[0]?.date ?? null;
	const last = points.at(-1)?.date ?? null;
	const reasons: string[] = [];
	if (!first || !last) reasons.push("no_observations");
	if (first && Math.abs(dayNumber(from) - dayNumber(first)) > 7)
		reasons.push("short_history");
	const stale = last !== null && dayNumber(to) - dayNumber(last) > 7;
	if (stale) reasons.push("endpoint_lag");
	for (let i = 1; i < points.length; i++) {
		if (
			dayNumber(points[i]?.date ?? "") - dayNumber(points[i - 1]?.date ?? "") >
			maxGap
		) {
			reasons.push("interior_gap");
			break;
		}
	}
	return {
		availability: reasons.length
			? points.length
				? "partial"
				: "unavailable"
			: "available",
		freshness: last ? (stale ? "stale" : "fresh") : "unknown",
		reasons,
		firstDate: first,
		lastDate: last,
	};
}

export function windowPoints(
	input: readonly KnowledgePoint[],
	from: string,
	to: string,
) {
	return orderedPoints(input).filter((p) => p.date >= from && p.date <= to);
}

export function historyMetrics(
	series: ReferenceSeries,
	from: string,
	to: string,
): KnowledgePerformance {
	const points = windowPoints(series.points, from, to);
	const quality = seriesQuality(points, from, to);
	const result: KnowledgePerformance = {
		referenceId: series.id,
		basis: series.basis,
		from,
		to,
		actualFrom: points[0]?.date ?? null,
		actualTo: points.at(-1)?.date ?? null,
		observations: points.length,
		cumulativeReturn: null,
		cagr: null,
		annualizedVolatility: null,
		maxDrawdown: null,
		peakDate: null,
		troughDate: null,
		recoveryDate: null,
		quality,
	};
	const first = points[0];
	const last = points.at(-1);
	if (
		!first ||
		!last ||
		quality.availability !== "available" ||
		points.length <
			Math.max(2, (200 * (dayNumber(to) - dayNumber(from))) / 365.2425)
	) {
		if (
			first &&
			last &&
			points.length <
				Math.max(2, (200 * (dayNumber(to) - dayNumber(from))) / 365.2425)
		) {
			quality.availability = "partial";
			quality.reasons.push("daily_coverage");
		}
		return result;
	}
	result.cumulativeReturn = last.value / first.value - 1;
	const years = (dayNumber(last.date) - dayNumber(first.date)) / 365.2425;
	result.cagr =
		years >= 365 / 365.2425
			? (last.value / first.value) ** (1 / years) - 1
			: null;
	const returns: number[] = [];
	for (let i = 1; i < points.length; i++) {
		const p = points[i];
		const prior = points[i - 1];
		if (p && prior) returns.push(p.value / prior.value - 1);
	}
	const drawdown = calculateDrawdown(points);
	result.maxDrawdown = drawdown.maxDrawdown;
	// A zero drawdown has no episode, even though the shared calculator
	// retains a first-date sentinel for its portfolio chart consumers.
	if (drawdown.maxDrawdown < 0) {
		result.peakDate = drawdown.peakDate;
		result.troughDate = drawdown.maxDrawdownDate;
		result.recoveryDate = drawdown.recoveryDate;
	}
	const mean = returns.reduce((sum, v) => sum + v, 0) / returns.length;
	// Actual observation frequency preserves daily crypto versus trading sessions.
	result.annualizedVolatility = Math.sqrt(
		(returns.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
			(returns.length - 1)) *
			(returns.length / years),
	);
	return result;
}

export function referenceCorrelation(
	a: ReferenceSeries,
	b: ReferenceSeries,
	horizon: 1 | 3 | 5 | 10,
	currency: string,
	to: string,
): KnowledgeCorrelation {
	return createReferenceCorrelationReader(horizon, currency, to)(a, b);
}
/** One local cache per build/window. Never crosses input revisions or requests. */
export function createReferenceCorrelationReader(
	horizon: 1 | 3 | 5 | 10,
	currency: string,
	to: string,
) {
	const from = yearsBefore(to, horizon);
	const cache = new WeakMap<KnowledgePoint[], Map<string, number | null>>();
	const returns = (series: ReferenceSeries) => {
		let values = cache.get(series.points);
		if (!values) {
			values = weeklyReturns(series.points, from, to);
			cache.set(series.points, values);
		}
		return values;
	};
	return (a: ReferenceSeries, b: ReferenceSeries): KnowledgeCorrelation => {
		const [left, right] = a.id < b.id ? [a, b] : [b, a];
		const from = yearsBefore(to, horizon);
		const x = returns(left);
		const y = returns(right);
		const xs: Array<number | null> = [];
		const ys: Array<number | null> = [];
		let longestGap = 0;
		let gap = 0;
		let first: string | null = null;
		let last: string | null = null;
		for (const [date, value] of x) {
			const other = y.get(date) ?? null;
			xs.push(value);
			ys.push(other);
			if (value === null || other === null) {
				gap++;
				longestGap = Math.max(gap, longestGap);
			} else {
				gap = 0;
				first ??= date;
				last = date;
			}
		}
		const { r, n } = pearson(xs, ys);
		const expected = x.size;
		const coverage = expected ? n / expected : 0;
		const reasons: string[] = [];
		if (n < 40 || coverage < 0.8) reasons.push("weekly_coverage");
		if (!first || dayNumber(first) - dayNumber(from) > 14)
			reasons.push("short_history");
		if (!last || dayNumber(to) - dayNumber(last) > 14)
			reasons.push("endpoint_lag");
		if (longestGap > 3) reasons.push("interior_gap");
		if (r === null) reasons.push("zero_variance_or_no_sample");
		const coefficient =
			reasons.length || r === null ? null : Math.max(-1, Math.min(1, r));
		return {
			left: left.id,
			right: right.id,
			currency,
			horizon,
			from,
			to,
			frequency: "weekly",
			leftBasis: left.basis,
			rightBasis: right.basis,
			coefficient,
			sampleCount: n,
			expectedCount: expected,
			coverage,
			interval95:
				coefficient === null
					? null
					: [...(fisherInterval(coefficient, n) ?? [-1, 1])],
			quality: {
				availability:
					coefficient === null ? (n ? "partial" : "unavailable") : "available",
				freshness: last
					? dayNumber(to) - dayNumber(last) > 14
						? "stale"
						: "fresh"
					: "unknown",
				reasons,
				firstDate: first,
				lastDate: last,
			},
		};
	};
}
