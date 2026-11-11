/** One fund per ISIN: folding the same fund held at several accounts into one input. */
import { isIsinShape } from "../isin.js";
import { holdNeverLookedThroughFundsWhole } from "./dissolve.js";
import { positionIdentity } from "./identity.js";
import type { EngineEtfInput } from "./types.js";
export function fundIdentity(
	etf: Pick<EngineEtfInput, "isin" | "ticker">,
): string | null {
	return positionIdentity(normalisedIsin(etf.isin), etf.ticker);
}
function isinKeyOf(etf: Pick<EngineEtfInput, "isin">): string | null {
	return positionIdentity(normalisedIsin(etf.isin), null);
}
function tickerKeyOf(etf: Pick<EngineEtfInput, "ticker">): string | null {
	return positionIdentity(null, etf.ticker);
}
function groupRowsByFund(etfs: readonly EngineEtfInput[]): EngineEtfInput[][] {
	const groupOfRow: number[] = [];
	const byIsin = new Map<string, number>();
	const byTicker = new Map<string, number | null>();
	const unnamedByTicker = new Map<string, number>();
	let groupCount = 0;
	const assign = (row: number, group: number, etf: EngineEtfInput) => {
		groupOfRow[row] = group;
		const ticker = tickerKeyOf(etf);
		if (ticker) {
			if (!byTicker.has(ticker)) byTicker.set(ticker, group);
			else if (byTicker.get(ticker) !== group) byTicker.set(ticker, null);
		}
	};
	etfs.forEach((etf, row) => {
		const key = isinKeyOf(etf);
		if (!key) return;
		let group = byIsin.get(key);
		if (group === undefined) {
			group = groupCount++;
			byIsin.set(key, group);
		}
		assign(row, group, etf);
	});
	etfs.forEach((etf, row) => {
		if (isinKeyOf(etf)) return;
		const ticker = tickerKeyOf(etf);
		const known = ticker ? byTicker.get(ticker) : undefined;
		const group =
			known ??
			(ticker ? unnamedByTicker.get(ticker) : undefined) ??
			groupCount++;
		groupOfRow[row] = group;
		if (ticker && known == null) unnamedByTicker.set(ticker, group);
	});
	const groups: EngineEtfInput[][] = [];
	const slot = new Map<number, EngineEtfInput[]>();
	etfs.forEach((etf, row) => {
		const group = groupOfRow[row] as number;
		let rows = slot.get(group);
		if (!rows) {
			rows = [];
			slot.set(group, rows);
			groups.push(rows);
		}
		rows.push(etf);
	});
	return groups;
}
function looksThrough(etf: EngineEtfInput): boolean {
	return !etf.degraded && etf.constituents.length > 0;
}
function coverageOf(etf: EngineEtfInput): number {
	let sum = 0;
	for (const c of etf.constituents) if (c.weight > 0) sum += c.weight;
	return Math.min(sum, 1);
}
function bySpelling(a: EngineEtfInput, b: EngineEtfInput): number {
	if (a.ticker.length !== b.ticker.length)
		return a.ticker.length - b.ticker.length;
	return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;
}
function representativeOf(rows: readonly EngineEtfInput[]): EngineEtfInput {
	const seen = rows.filter(looksThrough);
	if (seen.length > 0) {
		return seen.sort(
			(a, b) => coverageOf(b) - coverageOf(a) || bySpelling(a, b),
		)[0] as EngineEtfInput;
	}
	const clean = rows.filter((r) => !r.degraded);
	const tier = clean.length > 0 ? clean : [...rows];
	return tier.sort(bySpelling)[0] as EngineEtfInput;
}
function carriesLookthrough(etf: EngineEtfInput): boolean {
	return (
		etf.constituents.length > 0 ||
		(etf.sectorVector?.length ?? 0) > 0 ||
		(etf.countryVector?.length ?? 0) > 0
	);
}
function foldedDegraded(
	rows: readonly EngineEtfInput[],
	rep: EngineEtfInput,
): boolean {
	return rows.some((r) => r.degraded === true) && !carriesLookthrough(rep);
}
function present<T>(value: T | null | undefined): value is T {
	return value != null && !(Array.isArray(value) && value.length === 0);
}
function firstPresent<T>(
	rows: readonly EngineEtfInput[],
	pick: (row: EngineEtfInput) => T | null | undefined,
): T | null {
	for (const row of rows) {
		const value = pick(row);
		if (present(value)) return value;
	}
	return null;
}
function normalisedIsin(isin: string | null | undefined): string | null {
	const value = isin?.trim().toUpperCase();
	return value && isIsinShape(value) ? value : null;
}
export function mergeEtfInputsByFund(
	etfs: readonly EngineEtfInput[],
): EngineEtfInput[] {
	return holdNeverLookedThroughFundsWhole(foldRowsIntoFunds(etfs));
}
function foldRowsIntoFunds(etfs: readonly EngineEtfInput[]): EngineEtfInput[] {
	return groupRowsByFund(etfs).map((rows) => {
		if (rows.length === 1) return rows[0] as EngineEtfInput;
		const rep = representativeOf(rows);
		const others = rows.filter((r) => r !== rep);
		let value = 0;
		for (const r of rows) value += r.value;
		const pick = <T>(
			own: T | null | undefined,
			field: (row: EngineEtfInput) => T | null | undefined,
		): T | null => (present(own) ? own : firstPresent(others, field));
		return {
			...rep,
			value,
			degraded: foldedDegraded(rows, rep),
			isin: pick(normalisedIsin(rep.isin), (r) => normalisedIsin(r.isin)),
			underlyingAssetClass: pick(
				rep.underlyingAssetClass,
				(r) => r.underlyingAssetClass,
			),
			asOf: pick(rep.asOf, (r) => r.asOf),
			sectorVector: pick(rep.sectorVector, (r) => r.sectorVector),
			countryVector: pick(rep.countryVector, (r) => r.countryVector),
			industryVector: pick(rep.industryVector, (r) => r.industryVector),
		};
	});
}
