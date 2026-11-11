import { describe, expect, it } from "vitest";
import { pairChanges } from "../../src/internal/correlation/changes.js";
import type { PairReading } from "../../src/internal/correlation/matrix.js";
import {
	correlationBand,
	fisherInterval,
} from "../../src/internal/correlation/statistics.js";
function pair(
	a: string,
	b: string,
	correlation: number,
	n: number,
): PairReading {
	return {
		a,
		b,
		correlation,
		n,
		band: correlationBand(correlation, n),
		interval: fisherInterval(correlation, n),
	};
}
describe("pairChanges", () => {
	it("names a pair whose word changed and whose intervals do not overlap, largest change first", () => {
		const one = [
			pair("A", "B", 0.9, 52),
			pair("A", "C", 0.5, 52),
			pair("B", "C", 0.1, 52),
		];
		const five = [
			pair("A", "B", -0.5, 260),
			pair("A", "C", 0.4, 260),
			pair("B", "C", 0.6, 260),
		];
		const out = pairChanges(one, five);
		expect(out.map((c) => `${c.a}|${c.b}`)).toEqual(["A|B", "B|C"]);
		expect(out[0]).toEqual({
			a: "A",
			b: "B",
			fiveYears: -0.5,
			lastYear: 0.9,
			fiveYearsBand: "opposite",
			lastYearBand: "close",
		});
	});
	it("says nothing for a pair whose word is the same, undetermined, or inside the noise", () => {
		expect(
			pairChanges([pair("A", "B", 0.8, 52)], [pair("A", "B", 0.75, 260)]),
		).toEqual([]);
		expect(
			pairChanges([pair("A", "B", 0.5, 12)], [pair("A", "B", 0.1, 260)]),
		).toEqual([]);
		expect(
			pairChanges([pair("A", "B", 0.35, 52)], [pair("A", "B", 0.25, 260)]),
		).toEqual([]);
		expect(pairChanges([], [pair("A", "B", 0.9, 260)])).toEqual([]);
	});
});
