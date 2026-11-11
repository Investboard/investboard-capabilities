// Copyright 2026 Investboard GmbH. SPDX-License-Identifier: Apache-2.0
import type {
	AttributedCashFlow,
	HoldingValueSeries,
} from "./performance/holding-attribution.js";
import type { Snapshot } from "./performance/types.js";
import { sumMoney } from "./money/cents.js";

export function firstUnlinkedCapitalDate(
	flows: readonly AttributedCashFlow[],
	to: string,
) {
	return flows
		.filter(
			(flow) =>
				flow.holdingId === null &&
				flow.type !== "dividend" &&
				// A standalone fee is known money that bought nothing, never unlinked capital.
				flow.recordedCost !== true &&
				flow.date <= to,
		)
		.map((flow) => flow.date)
		.sort()[0];
}

/** Integrate historical capital over valuation AND position-change boundaries.
 * Unknown capital is never replaced by today's weights or a count of holdings. */
export function attributionCoverage(
	snapshots: readonly Snapshot[],
	series: readonly HoldingValueSeries[],
	unknownExposureDates: ReadonlySet<string> = new Set(),
	unknownCapitalFrom?: string,
) {
	const maps = series.map(
		(holding) =>
			new Map(holding.values.map((point) => [point.date, point.value])),
	);
	const observed = new Map(snapshots.map((point) => [point.date, point.value]));
	const first = snapshots[0]?.date ?? "";
	const last = snapshots.at(-1)?.date ?? "";
	const dates = [
		...new Set([
			...observed.keys(),
			...series.flatMap((holding) => holding.values.map((point) => point.date)),
		]),
	]
		.filter((date) => date >= first && date <= last)
		.sort();
	let total = 0;
	let covered = 0;
	let coverageKnown = true;
	for (let index = 0; index < dates.length - 1; index++) {
		const start = dates[index];
		const end = dates[index + 1];
		if (!start || !end) continue;
		const days = (Date.parse(end) - Date.parse(start)) / 86_400_000;
		const values = maps.map((map) => map.get(start));
		const knownCapital = sumMoney(
			values.map((value) => Math.max(0, value ?? 0)),
		);
		const unknownCapital =
			unknownExposureDates.has(start) ||
			(unknownCapitalFrom != null && start >= unknownCapitalFrom) ||
			values.some((value) => value == null);
		const denominator =
			observed.get(start) ?? (unknownCapital ? null : knownCapital);
		if (denominator == null) {
			coverageKnown = false;
			continue;
		}
		if (days <= 0 || denominator <= 0) continue;
		const valued = sumMoney(
			maps.map((map) =>
				map.get(start) != null && map.get(end) != null
					? Math.max(0, map.get(start) ?? 0)
					: 0,
			),
		);
		if (unknownCapital && valued >= denominator * (1 - 1e-10))
			coverageKnown = false;
		total += Math.max(denominator, knownCapital) * days;
		covered += Math.min(denominator, valued) * days;
	}
	return {
		coveragePct:
			coverageKnown && total > 0 ? Math.min(100, (covered * 100) / total) : 0,
		coverageKnown: coverageKnown && total > 0,
	};
}
