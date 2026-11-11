import { describe, expect, it } from "vitest";
import { readDiversification } from "../../src/internal/correlation/reading.js";
import { ANCHOR, fiveYearBook, oneYearBook } from "./fixtures.js";
describe("readDiversification", () => {
	const reading = readDiversification(fiveYearBook(), ANCHOR);
	const byWindow = new Map(reading.windows.map((w) => [w.window, w] as const));
	it("reads all four windows and refuses the one the history cannot fill", () => {
		expect(reading.windows.map((w) => `${w.window}:${w.status}`)).toEqual([
			"1y:available",
			"3y:available",
			"5y:available",
			"10y:insufficient_history",
		]);
	});
	it("measures three years on its own 156-week sample, not an alias of five", () => {
		const three = byWindow.get("3y");
		const five = byWindow.get("5y");
		expect(three?.status).toBe("available");
		if (three?.status !== "available" || five?.status !== "available")
			throw new Error("Synthetic windows should be available");
		expect(three.weeks).toBe(156);
		expect(three.commonWeeks).toBe(156);
		expect(three.from).toBe("2023-09-29");
		expect(three.to).toBe(ANCHOR);
		expect(three.weightedMeanCorrelation).not.toBeCloseTo(
			five.weightedMeanCorrelation,
			3,
		);
		expect(three.pairs.every((p) => p.n === 156)).toBe(true);
		expect(three.changes).toBeNull();
		expect(
			readDiversification(oneYearBook(), ANCHOR).windows.find(
				(w) => w.window === "3y",
			),
		).toEqual({ window: "3y", status: "insufficient_history" });
	});
	it("counts H into the block over one year and outside it over five", () => {
		const one = byWindow.get("1y")!;
		const five = byWindow.get("5y")!;
		if (one.status !== "available" || five.status !== "available") return;
		expect(one.largestGroupShare!).toBeCloseTo(80 / 95, 10);
		expect(five.largestGroupShare!).toBeCloseTo(60 / 95, 10);
	});
	it("names the pairs whose word changed beyond the noise, on the 5-year reading only", () => {
		const five = byWindow.get("5y")!;
		const one = byWindow.get("1y")!;
		if (five.status !== "available" || one.status !== "available") return;
		expect(five.changes).not.toBeNull();
		const changes = five.changes ?? [];
		expect(changes.map((c) => `${c.a}|${c.b}`)).toEqual(["A|H", "B|H", "C|H"]);
		const ah = changes[0]!;
		expect(ah.fiveYears).toBeCloseTo(-0.552499143, 9);
		expect(ah.lastYear).toBeCloseTo(0.9805371034, 9);
		expect(ah.fiveYearsBand).toBe("opposite");
		expect(ah.lastYearBand).toBe("close");
		expect(changes.some((c) => c.a === "D" || c.b === "D")).toBe(false);
		expect(one.changes).toBeNull();
	});
	it("orders the block first in each window and weighs the pairs by value", () => {
		const five = byWindow.get("5y")!;
		const one = byWindow.get("1y")!;
		if (five.status !== "available" || one.status !== "available") return;
		expect(five.order).toEqual(["A", "B", "C", "D", "H"]);
		expect(one.order).toEqual(["A", "B", "H", "C", "D"]);
		expect(five.weightedMeanCorrelation).toBeCloseTo(0.1251879479, 9);
		expect(one.weightedMeanCorrelation).toBeCloseTo(0.6565212718, 9);
		expect(five.from).toBe("2021-10-01");
	});
});
