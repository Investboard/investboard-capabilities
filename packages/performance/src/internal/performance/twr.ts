// Copyright 2026 Investboard GmbH. SPDX-License-Identifier: Apache-2.0
import {
	asCents,
	type Cents,
	fromEuros,
	sumCents,
	toEuros,
} from "../money/cents.js";
import {
	assertNever,
	classifyOpeningBoundary,
	classifyTerminalBoundary,
	getLatestSnapshotBefore,
} from "./twr-boundary.js";
import type {
	CashFlow,
	Confidence,
	DataQuality,
	Snapshot,
	TwrResult,
} from "./types.js";
const MAX_ANNUALIZATION_GAP_DAYS = 100;
export function calculateTwr(
	snapshots: Snapshot[],
	cashFlows: CashFlow[],
): TwrResult {
	if (snapshots.length === 0) {
		return {
			twr: 0,
			annualizedTwr: null,
			subPeriodReturns: [],
			timeSeries: [],
			snapshotCount: 0,
			dateRange: { from: "", to: "" },
			effectiveStartDate: "",
			confidence: "low",
			dataQuality: "ok",
			maxCarryForwardDays: 0,
			shallowHistoryWarning: false,
		};
	}
	const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
	const snapshotCount = sorted.length;
	const firstDate = sorted[0]!.date;
	const lastDate = sorted[sorted.length - 1]!.date;
	if (snapshotCount === 1) {
		return {
			twr: 0,
			annualizedTwr: null,
			subPeriodReturns: [],
			timeSeries: [{ date: firstDate, return: 0 }],
			snapshotCount: 1,
			dateRange: { from: firstDate, to: firstDate },
			effectiveStartDate: firstDate,
			confidence: getConfidence(1),
			dataQuality: "ok",
			maxCarryForwardDays: 0,
			shallowHistoryWarning: false,
		};
	}
	const snapshotMap = new Map<string, number>();
	for (const s of sorted) {
		snapshotMap.set(s.date, s.value);
	}
	const filteredFlows = cashFlows
		.filter((cf) => cf.date >= firstDate && cf.date <= lastDate)
		.filter((cf) => cf.type === "dividend" || cf.date !== firstDate)
		.sort((a, b) => a.date.localeCompare(b.date));
	const externalFlows = filteredFlows.filter((cf) => cf.type !== "dividend");
	const dividendFlows = filteredFlows.filter((cf) => cf.type === "dividend");
	const netFlowCentsByDate = new Map<string, Cents>();
	{
		const centsByDate = new Map<string, Cents[]>();
		for (const cf of externalFlows) {
			const signed =
				cf.type === "buy"
					? fromEuros(Math.abs(cf.amount))
					: (-fromEuros(Math.abs(cf.amount)) as Cents);
			const bucket = centsByDate.get(cf.date);
			if (bucket) {
				bucket.push(signed);
			} else {
				centsByDate.set(cf.date, [signed]);
			}
		}
		for (const [date, list] of centsByDate) {
			netFlowCentsByDate.set(date, sumCents(list));
		}
	}
	function netFlowEurOnDate(date: string): number {
		const c = netFlowCentsByDate.get(date) ?? (asCents(0) as Cents);
		return toEuros(c);
	}
	function dividendsInInterval(from: string, to: string): number {
		const includeFrom = from === firstDate;
		const parts: Cents[] = [];
		for (const cf of dividendFlows) {
			const afterOpen = includeFrom ? cf.date >= from : cf.date > from;
			if (afterOpen && cf.date <= to) {
				parts.push(fromEuros(Math.abs(cf.amount)));
			}
		}
		if (parts.length === 0) return 0;
		return toEuros(sumCents(parts));
	}
	const boundaryDatesSet = new Set<string>();
	for (const cf of externalFlows) {
		boundaryDatesSet.add(cf.date);
	}
	const boundaryDates = [...boundaryDatesSet].sort();
	const intervals: Array<{
		from: string;
		to: string;
	}> = [];
	let prevDate = firstDate;
	for (const bd of boundaryDates) {
		if (bd > prevDate) {
			intervals.push({ from: prevDate, to: bd });
			prevDate = bd;
		}
	}
	if (prevDate < lastDate) {
		intervals.push({ from: prevDate, to: lastDate });
	}
	if (intervals.length === 0) {
		intervals.push({ from: firstDate, to: lastDate });
	}
	let maxCarryForwardDays = 0;
	for (let i = 1; i < sorted.length; i++) {
		const gap = daysBetween(sorted[i - 1]!.date, sorted[i]!.date);
		if (gap > maxCarryForwardDays) {
			maxCarryForwardDays = gap;
		}
	}
	function getValueAtDate(date: string): number {
		if (snapshotMap.has(date)) {
			return snapshotMap.get(date)!;
		}
		let bestDate = "";
		let bestValue = 0;
		for (const s of sorted) {
			if (s.date <= date) {
				bestDate = s.date;
				bestValue = s.value;
			} else {
				break;
			}
		}
		if (bestDate) {
			const gapDays = daysBetween(bestDate, date);
			if (gapDays > maxCarryForwardDays) {
				maxCarryForwardDays = gapDays;
			}
			return bestValue;
		}
		return sorted[0]!.value;
	}
	function resolveOpeningNav(interval: { from: string; to: string }): number {
		const kind = classifyOpeningBoundary(interval, {
			firstDate,
			boundaryDatesSet,
			snapshotMap,
		});
		switch (kind) {
			case "first-date":
			case "boundary-snapshot":
			case "non-boundary-carry":
				return getValueAtDate(interval.from);
			case "boundary-folded-carry":
				return getValueAtDate(interval.from) + netFlowEurOnDate(interval.from);
			default:
				return assertNever(kind, "TWR opening boundary kind");
		}
	}
	function resolveTerminalNav(interval: { from: string; to: string }): number {
		const kind = classifyTerminalBoundary(interval, {
			lastDate,
			boundaryDatesSet,
			snapshotMap,
			sorted,
		});
		switch (kind) {
			case "terminal-flow-stripped":
			case "mid-boundary-snapshot-stripped":
				return getValueAtDate(interval.to) - netFlowEurOnDate(interval.to);
			case "mid-boundary-prev-snapshot": {
				const prevSnapshot = getLatestSnapshotBefore(sorted, interval.to)!;
				if (prevSnapshot.date !== interval.to) {
					const gap = daysBetween(prevSnapshot.date, interval.to);
					if (gap > maxCarryForwardDays) {
						maxCarryForwardDays = gap;
					}
				}
				return prevSnapshot.value;
			}
			case "mid-boundary-no-snapshot-carry":
			case "non-boundary-carry":
				return getValueAtDate(interval.to);
			default:
				return assertNever(kind, "TWR terminal boundary kind");
		}
	}
	function calculateModifiedDietzReturn(
		from: string,
		to: string,
		beginValue: number,
		endValue: number,
	): {
		return: number | null;
		undefinedSubPeriod: boolean;
	} {
		const calendarDays = daysBetween(from, to);
		if (calendarDays === 0) {
			return { return: 0, undefinedSubPeriod: false };
		}
		const periodFlows = externalFlows.filter(
			(cf) => cf.date > from && cf.date < to,
		);
		const weightedFlows = periodFlows.map((cf) => {
			const elapsedDays = daysBetween(from, cf.date);
			const dayWeight = (calendarDays - elapsedDays) / calendarDays;
			const amount =
				cf.type === "buy" ? Math.abs(cf.amount) : -Math.abs(cf.amount);
			return { amount, dayWeight };
		});
		const totalCashFlow = weightedFlows.reduce(
			(sum, flow) => sum + flow.amount,
			0,
		);
		const weightedCashFlow = weightedFlows.reduce(
			(sum, flow) => sum + flow.amount * flow.dayWeight,
			0,
		);
		const denominator = beginValue + weightedCashFlow;
		const dividends = dividendsInInterval(from, to);
		if (Math.abs(denominator) < 1e-10) {
			// A zero-capital interval is neutral only if no unexplained gain exists.
			const unexplained =
				Math.abs(endValue - beginValue - totalCashFlow + dividends) > 1e-10;
			return {
				return: unexplained ? null : 0,
				undefinedSubPeriod: unexplained,
			};
		}
		if (denominator < 0) {
			return { return: null, undefinedSubPeriod: true };
		}
		return {
			return: (endValue - beginValue - totalCashFlow + dividends) / denominator,
			undefinedSubPeriod: false,
		};
	}
	const subPeriodReturns: Array<{
		from: string;
		to: string;
		return: number | null;
	}> = [];
	const checkpointDates = [...new Set(sorted.map((snapshot) => snapshot.date))];
	const timeSeries: Array<{
		date: string;
		return: number;
	}> = [{ date: firstDate, return: 0 }];
	let checkpointIndex = 1;
	let cumulativeFactor = 1;
	let hasUndefinedSubPeriod = false;
	for (const interval of intervals) {
		if (daysBetween(interval.from, interval.to) === 0) continue;
		const beginValue = resolveOpeningNav(interval);
		const endValue = resolveTerminalNav(interval);
		const periodResult = calculateModifiedDietzReturn(
			interval.from,
			interval.to,
			beginValue,
			endValue,
		);
		const periodReturn = periodResult.return;
		hasUndefinedSubPeriod ||= periodResult.undefinedSubPeriod;
		subPeriodReturns.push({
			from: interval.from,
			to: interval.to,
			return: periodReturn,
		});
		while (checkpointIndex < checkpointDates.length) {
			const checkpointDate = checkpointDates[checkpointIndex];
			if (checkpointDate === undefined || checkpointDate > interval.to) break;
			if (checkpointDate > interval.from) {
				const checkpointReturn =
					checkpointDate === interval.to
						? periodReturn
						: calculateModifiedDietzReturn(
								interval.from,
								checkpointDate,
								beginValue,
								getValueAtDate(checkpointDate),
							).return;
				timeSeries.push({
					date: checkpointDate,
					return: cumulativeFactor * (1 + (checkpointReturn ?? 0)) - 1,
				});
			}
			checkpointIndex += 1;
		}
		if (periodReturn !== null) {
			cumulativeFactor *= 1 + periodReturn;
		}
	}
	const twr = cumulativeFactor - 1;
	const finalTimeSeriesPoint = timeSeries.at(-1);
	if (timeSeries.length > 1 && finalTimeSeriesPoint) {
		finalTimeSeriesPoint.return = twr;
	}
	const totalDays = daysBetween(firstDate, lastDate);
	let annualizedTwr: number | null = null;
	if (totalDays > 365) {
		annualizedTwr = (1 + twr) ** (365.25 / totalDays) - 1;
	}
	const shallowHistoryWarning =
		annualizedTwr !== null && maxCarryForwardDays > MAX_ANNUALIZATION_GAP_DAYS;
	const confidence = getConfidence(snapshotCount);
	const dataQuality: DataQuality = hasUndefinedSubPeriod
		? "undefined_subperiod"
		: maxCarryForwardDays > 7
			? "stale_pricing_gaps"
			: "ok";
	return {
		twr,
		annualizedTwr,
		subPeriodReturns,
		timeSeries,
		snapshotCount,
		dateRange: { from: firstDate, to: lastDate },
		effectiveStartDate: firstDate,
		confidence,
		dataQuality,
		maxCarryForwardDays,
		shallowHistoryWarning,
	};
}
function daysBetween(from: string, to: string): number {
	const a = new Date(from + "T00:00:00Z");
	const b = new Date(to + "T00:00:00Z");
	return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
function getConfidence(count: number): Confidence {
	if (count < 10) return "low";
	if (count < 30) return "medium";
	return "high";
}
