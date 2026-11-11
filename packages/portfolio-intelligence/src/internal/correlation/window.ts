/** One window's reading: eligible holdings, the common sample of weeks, the matrix, groups and worst weeks. */
import type { PairChange } from "./changes.js";
import { averageLinkage } from "./groups.js";
import {
	type HoldingReading,
	type PairReading,
	readFigures,
} from "./matrix.js";
import { pearson } from "./statistics.js";
import {
	COVERED_VALUE_FLOOR,
	type DiversificationHolding,
	type DiversificationWindow,
	ELIGIBLE_SHARE,
	type ExclusionReason,
	MIN_HOLDINGS,
	WINDOW_WEEKS,
	WORST_WEEKS,
} from "./types.js";
import {
	dayNumber,
	isoFromDayNumber,
	weeklyCloses,
	weeklyReturns,
} from "./weekly.js";
export interface Exclusion {
	readonly id: string;
	readonly reason: ExclusionReason;
	readonly since: string | null;
}
export interface Group {
	readonly id: string;
	readonly members: readonly string[];
	readonly valueShare: number;
	readonly averageCorrelation: number;
}
export type { HoldingReading, PairReading, PairWord } from "./matrix.js";
export interface WindowAvailable {
	readonly status: "available";
	readonly window: DiversificationWindow;
	readonly from: string;
	readonly to: string;
	readonly weeks: number;
	readonly commonWeeks: number;
	readonly coverage: {
		readonly analyzedCount: number;
		readonly totalCount: number;
		readonly coveredValueShare: number;
		readonly exclusions: readonly Exclusion[];
	};
	readonly weightedMeanCorrelation: number;
	readonly largestGroupShare: number | null;
	readonly order: readonly string[];
	readonly matrix: ReadonlyArray<ReadonlyArray<number>>;
	readonly groups: readonly Group[];
	readonly holdings: readonly HoldingReading[];
	readonly pairs: readonly PairReading[];
	readonly nearDuplicates: ReadonlyArray<{
		readonly a: string;
		readonly b: string;
		readonly correlation: number;
	}>;
	readonly changes: readonly PairChange[] | null;
}
export interface WindowInsufficient {
	readonly status: "insufficient_history";
	readonly window: DiversificationWindow;
}
export type WindowReading = WindowAvailable | WindowInsufficient;
export interface WindowState {
	readonly reading: WindowReading;
	readonly returns: ReadonlyMap<string, ReadonlyArray<number | null>>;
	readonly common: readonly number[];
	readonly weights: ReadonlyMap<string, number>;
	readonly need: number;
}
export function groupId(members: readonly string[]): string {
	let h = 0x811c9dc5;
	for (const ch of [...members].sort().join("|")) {
		h ^= ch.charCodeAt(0);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return `g_${h.toString(16).padStart(8, "0")}`;
}
function isFlat(
	series: ReadonlyArray<number | null>,
	common: readonly number[],
): boolean {
	const first = series[common[0] as number];
	return common.every((k) => series[k] === first);
}
function commonSeries(
	series: ReadonlyArray<number | null>,
	common: readonly number[],
): number[] {
	return common.map((k) => series[k] as number);
}
export function blockSeries(
	ids: readonly string[],
	returns: ReadonlyMap<string, ReadonlyArray<number | null>>,
	weights: ReadonlyMap<string, number>,
	common: readonly number[],
): number[] {
	const total = ids.reduce((s, id) => s + (weights.get(id) ?? 0), 0);
	return common.map((k) => {
		let sum = 0;
		for (const id of ids)
			sum += (weights.get(id) ?? 0) * (returns.get(id)![k] as number);
		return sum / total;
	});
}
export function computeWindow(
	holdings: readonly DiversificationHolding[],
	anchor: string,
	window: DiversificationWindow,
): WindowState {
	const weeks = WINDOW_WEEKS[window];
	const need = Math.ceil(ELIGIBLE_SHARE * weeks);
	const bookValue = holdings.reduce((s, h) => s + h.valueBase, 0);
	const exclusions: Exclusion[] = [];
	const returns = new Map<string, Array<number | null>>();
	const firstDate = new Map<string, string | null>();
	for (const h of holdings) {
		if (
			h.exclusion !== null ||
			h.dailyBase === null ||
			h.dailyBase.length === 0
		) {
			exclusions.push({
				id: h.id,
				reason: h.exclusion ?? "no_market_series",
				since: null,
			});
			continue;
		}
		firstDate.set(h.id, h.dailyBase[0]!.date);
		const r = weeklyReturns(weeklyCloses(h.dailyBase, anchor, weeks));
		if (r.filter((v) => v !== null).length < need) {
			exclusions.push({
				id: h.id,
				reason: "short_history",
				since: h.dailyBase[0]!.date,
			});
			continue;
		}
		returns.set(h.id, r);
	}
	let eligible = holdings.filter((h) => returns.has(h.id));
	let common: number[] = [];
	for (;;) {
		common = [];
		for (let k = 0; k < weeks; k++) {
			if (eligible.every((h) => returns.get(h.id)![k] !== null)) common.push(k);
		}
		if (eligible.length === 0) break;
		if (common.length >= need) {
			const flat = eligible.filter((h) => isFlat(returns.get(h.id)!, common));
			if (flat.length === 0) break;
			for (const h of flat) {
				exclusions.push({ id: h.id, reason: "flat_series", since: null });
			}
			eligible = eligible.filter((h) => !flat.includes(h));
			continue;
		}
		const missing = (id: string) =>
			returns.get(id)!.filter((v) => v === null).length;
		const drop = [...eligible].sort(
			(a, b) =>
				missing(b.id) - missing(a.id) ||
				a.valueBase - b.valueBase ||
				a.id.localeCompare(b.id),
		)[0]!;
		eligible = eligible.filter((h) => h.id !== drop.id);
		exclusions.push({
			id: drop.id,
			reason: "short_history",
			since: firstDate.get(drop.id) ?? null,
		});
	}
	const covered = eligible.reduce((s, h) => s + h.valueBase, 0);
	const empty: WindowState = {
		reading: { status: "insufficient_history", window },
		returns,
		common,
		weights: new Map(),
		need,
	};
	if (
		eligible.length < MIN_HOLDINGS ||
		bookValue <= 0 ||
		covered < COVERED_VALUE_FLOOR * bookValue
	) {
		return empty;
	}
	const ids = [...eligible]
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((h) => h.id);
	const share = new Map(
		eligible.map((h) => [h.id, h.valueBase / bookValue] as const),
	);
	const onCommon = new Map(
		ids.map((id) => [id, commonSeries(returns.get(id)!, common)] as const),
	);
	const corr = ids.map((a) =>
		ids.map((b) => {
			if (a === b) return 1;
			const { r } = pearson(onCommon.get(a)!, onCommon.get(b)!);
			if (r === null) throw new Error(`no correlation for ${a} and ${b}`);
			return r;
		}),
	);
	const clusters = averageLinkage(corr).map((c) => c.map((i) => ids[i]!));
	const groups: Group[] = clusters
		.filter((members) => members.length >= 2)
		.map((unordered) => {
			const members = [...unordered].sort(
				(a, b) => share.get(b)! - share.get(a)! || a.localeCompare(b),
			);
			const idx = members.map((m) => ids.indexOf(m));
			let sum = 0;
			let count = 0;
			for (let x = 0; x < idx.length; x++) {
				for (let y = x + 1; y < idx.length; y++) {
					sum += corr[idx[x]!]![idx[y]!]!;
					count++;
				}
			}
			return {
				id: groupId(members),
				members,
				valueShare: members.reduce((s, m) => s + share.get(m)!, 0),
				averageCorrelation: sum / count,
			};
		})
		.sort(
			(a, b) =>
				b.valueShare - a.valueShare ||
				a.members[0]!.localeCompare(b.members[0]!),
		);
	const book = blockSeries(ids, returns, share, common);
	const worst = book
		.map((value, i) => ({ value, i }))
		.sort((a, b) => a.value - b.value || a.i - b.i)
		.slice(0, WORST_WEEKS)
		.map((w) => w.i);
	const figures = readFigures({
		ids,
		corr,
		share,
		groups,
		commonWeeks: common.length,
		worstWeeksUp: new Map(
			ids.map(
				(id) =>
					[
						id,
						worst.filter((i) => (onCommon.get(id)![i] as number) > 0).length,
					] as const,
			),
		),
		worstWeeksCount: worst.length,
	});
	const anchorDay = dayNumber(anchor);
	const firstCommon = common[0] as number;
	return {
		reading: {
			status: "available",
			window,
			from: isoFromDayNumber(anchorDay - 7 * (weeks - firstCommon)),
			to: anchor,
			weeks,
			commonWeeks: common.length,
			coverage: {
				analyzedCount: ids.length,
				totalCount: holdings.length,
				coveredValueShare: covered / bookValue,
				exclusions: [...exclusions].sort(
					(a, b) =>
						(holdings.find((h) => h.id === b.id)?.valueBase ?? 0) -
							(holdings.find((h) => h.id === a.id)?.valueBase ?? 0) ||
						a.id.localeCompare(b.id),
				),
			},
			weightedMeanCorrelation: figures.weightedMeanCorrelation,
			largestGroupShare: groups[0]?.valueShare ?? null,
			order: figures.order,
			matrix: figures.matrix,
			groups,
			holdings: figures.holdings,
			pairs: figures.pairs,
			nearDuplicates: figures.nearDuplicates,
			changes: null,
		},
		returns,
		common,
		weights: share,
		need,
	};
}
