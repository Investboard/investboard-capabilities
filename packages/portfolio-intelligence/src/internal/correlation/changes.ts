/** Pairs whose band changed between the 1-year and 5-year windows. */
import type { PairReading } from "./matrix.js";
import { intervalsDisjoint } from "./statistics.js";
import type { CorrelationBand } from "./types.js";
export interface PairChange {
	readonly a: string;
	readonly b: string;
	readonly fiveYears: number;
	readonly lastYear: number;
	readonly fiveYearsBand: CorrelationBand;
	readonly lastYearBand: CorrelationBand;
}
export function pairChanges(
	lastYear: readonly PairReading[],
	fiveYears: readonly PairReading[],
): PairChange[] {
	const one = new Map(lastYear.map((p) => [`${p.a}|${p.b}`, p] as const));
	const out: PairChange[] = [];
	for (const five of fiveYears) {
		const last = one.get(`${five.a}|${five.b}`);
		if (!last) continue;
		if (last.band === "undetermined" || five.band === "undetermined") continue;
		if (last.band === five.band) continue;
		if (
			!intervalsDisjoint(
				{ r: last.correlation, n: last.n },
				{ r: five.correlation, n: five.n },
			)
		) {
			continue;
		}
		out.push({
			a: five.a,
			b: five.b,
			fiveYears: five.correlation,
			lastYear: last.correlation,
			fiveYearsBand: five.band,
			lastYearBand: last.band,
		});
	}
	return out.sort(
		(x, y) =>
			Math.abs(y.fiveYears - y.lastYear) - Math.abs(x.fiveYears - x.lastYear) ||
			x.a.localeCompare(y.a) ||
			x.b.localeCompare(y.b),
	);
}
