// Copyright 2026 Investboard GmbH. SPDX-License-Identifier: Apache-2.0
import type { HoldingValueSeries } from "./performance/holding-attribution.js";
import type { Snapshot } from "./performance/types.js";

/** Integrate the positions actually held at each opening valuation. Rates are
 * today's recorded fund rates, so this is explanatory, never an observed cost. */
export function estimateHistoricalFundCosts(
	snapshots: readonly Snapshot[],
	series: readonly HoldingValueSeries[],
	terByHolding: ReadonlyMap<string, number | null>,
	expectedHoldingCount = series.length,
	unknownCapitalFrom?: string,
) {
	const valuesByHolding = series.map((holding) => ({
		id: holding.id,
		values: new Map(holding.values.map((point) => [point.date, point.value])),
	}));
	const observed = new Map(snapshots.map((point) => [point.date, point.value]));
	const first = snapshots[0]?.date;
	const last = snapshots.at(-1)?.date;
	const dates = [
		...new Set([
			...snapshots.map((point) => point.date),
			...series.flatMap((holding) => holding.values.map((point) => point.date)),
		]),
	]
		.filter((date) => first && last && date >= first && date <= last)
		.sort();
	let fundCosts = 0;
	let coveredCapitalDays = 0;
	let totalCapitalDays = 0;
	let coverageKnown = true;
	for (let index = 0; index < dates.length - 1; index++) {
		const start = dates[index];
		const end = dates[index + 1];
		if (!start || !end) continue;
		const days = (Date.parse(end) - Date.parse(start)) / 86_400_000;
		const values = valuesByHolding.map((holding) => holding.values.get(start));
		const knownValue = values.reduce<number>(
			(sum, value) => sum + Math.max(0, value ?? 0),
			0,
		);
		const unknownCapital =
			(unknownCapitalFrom != null && start >= unknownCapitalFrom) ||
			values.length !== expectedHoldingCount ||
			values.some((value) => value == null);
		const denominator =
			observed.get(start) ?? (!unknownCapital ? knownValue : null);
		if (denominator == null) {
			coverageKnown = false;
			continue;
		}
		if (days <= 0 || denominator <= 0) continue;
		if (unknownCapital && knownValue >= denominator * (1 - 1e-10))
			coverageKnown = false;
		totalCapitalDays += Math.max(denominator, knownValue) * days;
		for (const holding of valuesByHolding) {
			const value = holding.values.get(start);
			const rate = terByHolding.get(holding.id);
			if (value == null || value <= 0 || rate == null) continue;
			// A sparse valuation cannot justify weeks of historical expense.
			if (days > 7) continue;
			coveredCapitalDays += value * days;
			fundCosts += (value * rate * days) / 365;
		}
	}
	const coverage =
		coverageKnown && totalCapitalDays > 0
			? Math.min(1, coveredCapitalDays / totalCapitalDays)
			: 0;
	return { fundCosts, coverage, coverageKnown };
}
