/** The correlation matrix, pair readings and the value-weighted mean correlation. */
import { correlationBand, fisherInterval } from "./statistics.js";
import { type CorrelationBand, NEAR_DUPLICATE } from "./types.js";
export interface PairReading {
	readonly a: string;
	readonly b: string;
	readonly correlation: number;
	readonly n: number;
	readonly band: CorrelationBand;
	readonly interval: readonly [number, number] | null;
}
export interface PairWord {
	readonly id: string;
	readonly band: CorrelationBand;
	readonly correlation: number;
}
export interface HoldingReading {
	readonly id: string;
	readonly valueShare: number;
	readonly group: string | null;
	readonly meanToBlock: number | null;
	readonly meanToOthers: number;
	readonly mostWith: PairWord | null;
	readonly leastWith: PairWord | null;
	readonly worstWeeksUp: number;
	readonly worstWeeksCount: number;
}
export interface GroupLike {
	readonly id: string;
	readonly members: readonly string[];
}
type Matrix = ReadonlyArray<ReadonlyArray<number>>;
export function weightedMeanCorrelation(
	corr: Matrix,
	shares: readonly number[],
): number {
	let num = 0;
	let den = 0;
	for (let i = 0; i < corr.length; i++) {
		for (let j = i + 1; j < corr.length; j++) {
			const w = shares[i]! * shares[j]!;
			num += w * corr[i]![j]!;
			den += w;
		}
	}
	return den > 0 ? num / den : 0;
}
export function meanWith(
	corr: Matrix,
	i: number,
	columns: readonly number[],
): number | null {
	const js = columns.filter((j) => j !== i);
	if (js.length === 0) return null;
	return js.reduce((s, j) => s + corr[i]![j]!, 0) / js.length;
}
export function displayOrder(
	ids: readonly string[],
	groups: readonly GroupLike[],
	corr: Matrix,
): string[] {
	const grouped = groups.flatMap((g) => g.members);
	const all = ids.map((_, i) => i);
	const block = groups[0]?.members.map((m) => ids.indexOf(m)) ?? all;
	const key = (id: string) => meanWith(corr, ids.indexOf(id), block) ?? 0;
	const rest = ids
		.filter((id) => !grouped.includes(id))
		.sort((x, y) => key(y) - key(x) || x.localeCompare(y));
	return [...grouped, ...rest];
}
export interface FiguresInput {
	readonly ids: readonly string[];
	readonly corr: Matrix;
	readonly share: ReadonlyMap<string, number>;
	readonly groups: readonly GroupLike[];
	readonly commonWeeks: number;
	readonly worstWeeksUp: ReadonlyMap<string, number>;
	readonly worstWeeksCount: number;
}
export interface Figures {
	readonly weightedMeanCorrelation: number;
	readonly order: readonly string[];
	readonly matrix: Matrix;
	readonly holdings: readonly HoldingReading[];
	readonly pairs: readonly PairReading[];
	readonly nearDuplicates: ReadonlyArray<{
		readonly a: string;
		readonly b: string;
		readonly correlation: number;
	}>;
}
export function readFigures(input: FiguresInput): Figures {
	const { ids, corr, share, groups, commonWeeks } = input;
	const index = new Map(ids.map((id, i) => [id, i] as const));
	const at = (id: string) => index.get(id) as number;
	const pairs: PairReading[] = [];
	for (let a = 0; a < ids.length; a++) {
		for (let b = a + 1; b < ids.length; b++) {
			const r = corr[a]![b]!;
			pairs.push({
				a: ids[a]!,
				b: ids[b]!,
				correlation: r,
				n: commonWeeks,
				band: correlationBand(r, commonWeeks),
				interval: fisherInterval(r, commonWeeks),
			});
		}
	}
	pairs.sort(
		(x, y) =>
			y.correlation - x.correlation ||
			x.a.localeCompare(y.a) ||
			x.b.localeCompare(y.b),
	);
	const order = displayOrder(ids, groups, corr);
	const matrix = order.map((a) => order.map((b) => corr[at(a)]![at(b)]!));
	const all = ids.map((_, i) => i);
	const block = groups[0]?.members.map(at) ?? null;
	const holdings: HoldingReading[] = order.map((id) => {
		const i = at(id);
		const words = pairs
			.filter((p) => p.a === id || p.b === id)
			.map((p) => ({
				id: p.a === id ? p.b : p.a,
				band: p.band,
				correlation: p.correlation,
			}))
			.sort(
				(x, y) => y.correlation - x.correlation || x.id.localeCompare(y.id),
			);
		return {
			id,
			valueShare: share.get(id)!,
			group: groups.find((g) => g.members.includes(id))?.id ?? null,
			meanToBlock: block ? meanWith(corr, i, block) : null,
			meanToOthers: meanWith(corr, i, all) ?? 0,
			mostWith: words[0] ?? null,
			leastWith: words[words.length - 1] ?? null,
			worstWeeksUp: input.worstWeeksUp.get(id) ?? 0,
			worstWeeksCount: input.worstWeeksCount,
		};
	});
	return {
		weightedMeanCorrelation: weightedMeanCorrelation(
			corr,
			ids.map((id) => share.get(id)!),
		),
		order,
		matrix,
		holdings,
		pairs,
		nearDuplicates: pairs
			.filter((p) => p.correlation >= NEAR_DUPLICATE)
			.map((p) => ({ a: p.a, b: p.b, correlation: p.correlation })),
	};
}
