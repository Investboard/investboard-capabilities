// Copyright 2026 Investboard GmbH. SPDX-License-Identifier: Apache-2.0
import type {
	AttributedCashFlow,
	HoldingValuePoint,
	HoldingValueSeries,
} from "./holding-attribution.js";
import {
	classifyOpeningBoundary,
	classifyTerminalBoundary,
	getLatestSnapshotBefore,
} from "./twr-boundary.js";
import type { CashFlow, Snapshot } from "./types.js";
export interface AttributionContext {
	snapshots: Snapshot[];
	firstDate: string;
	lastDate: string;
	firstValue: number;
	lastValue: number;
	snapshotMap: ReadonlyMap<string, number>;
	boundaryDates: ReadonlySet<string>;
	netFlowByDate: ReadonlyMap<string, number>;
	externalFlows: AttributedCashFlow[];
	dividendFlows: AttributedCashFlow[];
}
function signedExternalAmount(flow: CashFlow): number {
	return flow.type === "buy" ? Math.abs(flow.amount) : -Math.abs(flow.amount);
}
export function valueAtOrBefore(
	series: ReadonlyArray<HoldingValuePoint>,
	date: string,
): number | null {
	let value: number | null = null;
	for (const point of series) {
		if (point.date > date) break;
		value = point.value;
	}
	return value;
}
export function sumByHolding(
	flows: ReadonlyArray<AttributedCashFlow>,
	predicate: (flow: AttributedCashFlow) => boolean,
): Map<string, number> {
	const result = new Map<string, number>();
	for (const flow of flows) {
		if (!flow.holdingId || !predicate(flow)) continue;
		const amount =
			flow.type === "dividend"
				? Math.abs(flow.amount)
				: signedExternalAmount(flow);
		result.set(flow.holdingId, (result.get(flow.holdingId) ?? 0) + amount);
	}
	return result;
}
export function buildAttributionContext(
	snapshots: Snapshot[],
	cashFlows: AttributedCashFlow[],
): AttributionContext {
	const firstSnapshot = snapshots[0];
	const lastSnapshot = snapshots.at(-1);
	if (!firstSnapshot || !lastSnapshot) {
		throw new Error("holding attribution requires portfolio snapshots");
	}
	const filteredFlows = cashFlows.filter(
		(flow) =>
			flow.date >= firstSnapshot.date &&
			flow.date <= lastSnapshot.date &&
			(flow.type === "dividend" || flow.date !== firstSnapshot.date),
	);
	const externalFlows = filteredFlows.filter(
		(flow) => flow.type !== "dividend",
	);
	const netFlowByDate = new Map<string, number>();
	for (const flow of externalFlows) {
		netFlowByDate.set(
			flow.date,
			(netFlowByDate.get(flow.date) ?? 0) + signedExternalAmount(flow),
		);
	}
	return {
		snapshots,
		firstDate: firstSnapshot.date,
		lastDate: lastSnapshot.date,
		firstValue: firstSnapshot.value,
		lastValue: lastSnapshot.value,
		snapshotMap: new Map(
			snapshots.map((snapshot) => [snapshot.date, snapshot.value]),
		),
		boundaryDates: new Set(externalFlows.map((flow) => flow.date)),
		netFlowByDate,
		externalFlows,
		dividendFlows: filteredFlows.filter((flow) => flow.type === "dividend"),
	};
}
function portfolioValueAtOrBefore(
	context: AttributionContext,
	date: string,
): number {
	let value = context.firstValue;
	for (const snapshot of context.snapshots) {
		if (snapshot.date > date) break;
		value = snapshot.value;
	}
	return value;
}
export function openingNav(
	context: AttributionContext,
	interval: {
		from: string;
		to: string;
	},
): number {
	const kind = classifyOpeningBoundary(interval, {
		firstDate: context.firstDate,
		boundaryDatesSet: context.boundaryDates,
		snapshotMap: context.snapshotMap,
	});
	const carried = portfolioValueAtOrBefore(context, interval.from);
	return kind === "boundary-folded-carry"
		? carried + (context.netFlowByDate.get(interval.from) ?? 0)
		: carried;
}
export function terminalHoldingValue(
	context: AttributionContext,
	holding: HoldingValueSeries,
	interval: {
		from: string;
		to: string;
	},
): number | null {
	const kind = classifyTerminalBoundary(interval, {
		lastDate: context.lastDate,
		boundaryDatesSet: context.boundaryDates,
		snapshotMap: context.snapshotMap,
		sorted: context.snapshots,
	});
	if (kind === "mid-boundary-prev-snapshot") {
		const previous = getLatestSnapshotBefore(context.snapshots, interval.to);
		return previous
			? valueAtOrBefore(holding.values, previous.date)
			: valueAtOrBefore(holding.values, interval.to);
	}
	const value = valueAtOrBefore(holding.values, interval.to);
	if (value === null) return null;
	const stripsTerminalFlow =
		kind === "terminal-flow-stripped" ||
		kind === "mid-boundary-snapshot-stripped";
	if (!stripsTerminalFlow) return value;
	const holdingFlow = sumByHolding(
		context.externalFlows,
		(flow) => flow.date === interval.to,
	).get(holding.id);
	return value - (holdingFlow ?? 0);
}
export function terminalSeriesValue(
	context: AttributionContext,
	series: ReadonlyArray<HoldingValuePoint>,
	interval: {
		from: string;
		to: string;
	},
): number | null {
	const kind = classifyTerminalBoundary(interval, {
		lastDate: context.lastDate,
		boundaryDatesSet: context.boundaryDates,
		snapshotMap: context.snapshotMap,
		sorted: context.snapshots,
	});
	if (kind === "mid-boundary-prev-snapshot") {
		const previous = getLatestSnapshotBefore(context.snapshots, interval.to);
		return valueAtOrBefore(series, previous?.date ?? interval.to);
	}
	return valueAtOrBefore(series, interval.to);
}
