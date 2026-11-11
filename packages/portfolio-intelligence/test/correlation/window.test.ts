import { describe, expect, it } from "vitest";
import type { DiversificationHolding } from "../../src/internal/correlation/types.js";
import {
	computeWindow,
	groupId,
} from "../../src/internal/correlation/window.js";
import {
	ANCHOR,
	apartBook,
	flatBook,
	lateStartBook,
	oneYearBook,
} from "./fixtures.js";
describe("computeWindow, one year", () => {
	const state = computeWindow(oneYearBook(), ANCHOR, "1y");
	const r = state.reading;
	it("is available over the weeks every eligible holding shares", () => {
		expect(r.status).toBe("available");
		if (r.status !== "available") return;
		expect(r.from).toBe("2025-09-26");
		expect(r.to).toBe("2026-09-25");
		expect(r.commonWeeks).toBe(50);
	});
	it("names what it left out, largest first, with the young holding's start", () => {
		if (r.status !== "available") return;
		expect(r.coverage.analyzedCount).toBe(5);
		expect(r.coverage.totalCount).toBe(7);
		expect(r.coverage.coveredValueShare).toBeCloseTo(95 / 110, 10);
		expect(r.coverage.exclusions).toEqual([
			{ id: "CASH", reason: "no_market_series", since: null },
			{ id: "F", reason: "short_history", since: "2026-02-27" },
		]);
	});
	it("finds A, B and C as the block, weighted by value", () => {
		if (r.status !== "available") return;
		expect(r.groups).toHaveLength(1);
		expect(r.groups[0]!.members).toEqual(["A", "B", "C"]);
		expect(r.groups[0]!.id).toBe(groupId(["C", "B", "A"]));
		expect(r.largestGroupShare!).toBeCloseTo(60 / 110, 10);
		expect(r.groups[0]!.averageCorrelation).toBeCloseTo(0.9898475198, 9);
	});
	it("lists every holding in the display order: the block, then the rest by their mean to it", () => {
		if (r.status !== "available") return;
		expect(r.order).toEqual(["A", "B", "C", "D", "E"]);
		expect(r.holdings.map((h) => h.id)).toEqual(r.order);
		const group = r.groups[0]!.id;
		expect(r.holdings.map((h) => h.group)).toEqual([
			group,
			group,
			group,
			null,
			null,
		]);
	});
	it("reads each holding's mean to the block and its move in the portfolio's 10 worst weeks", () => {
		if (r.status !== "available") return;
		const byId = new Map(r.holdings.map((h) => [h.id, h] as const));
		expect(byId.get("A")!.meanToBlock!).toBeCloseTo(0.9924650684, 9);
		expect(byId.get("D")!.meanToBlock!).toBeCloseTo(0.0695341096, 9);
		expect(byId.get("E")!.meanToBlock!).toBeCloseTo(-0.9719369864, 9);
		expect(byId.get("D")!.meanToOthers).toBeCloseTo(0.0371445104, 9);
		expect(
			r.holdings.map((h) => [h.id, h.worstWeeksUp, h.worstWeeksCount]),
		).toEqual([
			["A", 0, 10],
			["B", 0, 10],
			["C", 0, 10],
			["D", 3, 10],
			["E", 10, 10],
		]);
	});
	it("gives each holding the one it moved most and least with, figure and word", () => {
		if (r.status !== "available") return;
		const a = r.holdings.find((h) => h.id === "A")!;
		expect(a.mostWith!.id).toBe("B");
		expect(a.mostWith!.band).toBe("close");
		expect(a.mostWith!.correlation).toBeCloseTo(0.9958424641, 9);
		expect(a.leastWith!.id).toBe("E");
		expect(a.leastWith!.band).toBe("opposite");
	});
	it("weighs every pair by value into the window's one figure", () => {
		if (r.status !== "available") return;
		expect(r.weightedMeanCorrelation).toBeCloseTo(-0.0093767645, 9);
	});
	it("lists every pair once on the common weeks, strongest first, with its interval", () => {
		if (r.status !== "available") return;
		expect(r.pairs).toHaveLength(10);
		expect(r.pairs.map((p) => `${p.a}|${p.b}`)).toEqual([
			"A|B",
			"A|C",
			"B|C",
			"C|D",
			"A|D",
			"B|D",
			"D|E",
			"C|E",
			"B|E",
			"A|E",
		]);
		expect(r.pairs.every((p) => p.n === 50)).toBe(true);
		const ce = r.pairs.find((p) => p.a === "C" && p.b === "E")!;
		expect(ce.correlation).toBeCloseTo(-0.9671822814, 9);
		expect(ce.band).toBe("opposite");
		expect(ce.interval![0]).toBeLessThan(ce.correlation);
		expect(ce.interval![1]).toBeGreaterThan(ce.correlation);
	});
	it("aligns the matrix to the order, symmetric with a unit diagonal", () => {
		if (r.status !== "available") return;
		expect(r.matrix).toHaveLength(5);
		for (let i = 0; i < 5; i++) {
			expect(r.matrix[i]![i]).toBe(1);
			for (let j = 0; j < 5; j++) expect(r.matrix[i]![j]).toBe(r.matrix[j]![i]);
		}
		const at = (id: string) => r.order.indexOf(id);
		const ab = r.pairs.find((p) => p.a === "A" && p.b === "B")!;
		expect(r.matrix[at("A")]![at("B")]).toBe(ab.correlation);
	});
	it("flags pairs at 0.95 or above as near-duplicates", () => {
		if (r.status !== "available") return;
		expect(r.nearDuplicates.map((d) => `${d.a}|${d.b}`)).toEqual([
			"A|B",
			"A|C",
			"B|C",
		]);
	});
});
describe("computeWindow, a shared history shorter than the window", () => {
	it("starts the reading where the shared history starts", () => {
		const r = computeWindow(lateStartBook(), ANCHOR, "1y").reading;
		expect(r.status).toBe("available");
		if (r.status !== "available") return;
		expect(r.commonWeeks).toBe(47);
		expect(r.from).toBe("2025-10-31");
		expect(r.to).toBe("2026-09-25");
	});
});
describe("computeWindow, no group of two or more", () => {
	const r = computeWindow(apartBook(), ANCHOR, "1y").reading;
	it("has no block, so every holding carries its mean with the others and the order follows it", () => {
		expect(r.status).toBe("available");
		if (r.status !== "available") return;
		expect(r.groups).toEqual([]);
		expect(r.largestGroupShare).toBeNull();
		expect(r.order).toEqual(["R", "Q", "P"]);
		expect(r.holdings.map((h) => [h.id, h.group, h.meanToBlock])).toEqual([
			["R", null, null],
			["Q", null, null],
			["P", null, null],
		]);
		expect(r.holdings.find((h) => h.id === "P")!.meanToOthers).toBeCloseTo(
			-0.044140008,
			9,
		);
		expect(r.holdings.find((h) => h.id === "R")!.meanToOthers).toBeCloseTo(
			-0.0211952786,
			9,
		);
		expect(r.weightedMeanCorrelation).toBeCloseTo(-0.0421172974, 9);
		expect(r.pairs.map((p) => `${p.a}|${p.b}`)).toEqual(["Q|R", "P|R", "P|Q"]);
		expect(r.pairs.every((p) => p.band === "independent")).toBe(true);
		expect(r.changes).toBeNull();
	});
});
describe("computeWindow, a series that never moved", () => {
	it("leaves the window with its own reason instead of a coefficient of 0", () => {
		const r = computeWindow(flatBook(), ANCHOR, "1y").reading;
		expect(r.status).toBe("available");
		if (r.status !== "available") return;
		expect(r.coverage.exclusions).toEqual([
			{ id: "FLAT", reason: "flat_series", since: null },
		]);
		expect(r.coverage.analyzedCount).toBe(3);
		expect(r.coverage.coveredValueShare).toBeCloseTo(0.7647058824, 9);
		expect(r.order).toEqual(["A", "B", "D"]);
		expect(r.pairs.some((p) => p.a === "FLAT" || p.b === "FLAT")).toBe(false);
		expect(r.matrix.flat().every((v) => Number.isFinite(v))).toBe(true);
	});
});
describe("computeWindow, refusals", () => {
	it("refuses with fewer than three eligible holdings", () => {
		const two = oneYearBook().filter((h) => h.id === "A" || h.id === "B");
		expect(computeWindow(two, ANCHOR, "1y").reading.status).toBe(
			"insufficient_history",
		);
	});
	it("refuses when eligible holdings cover less than 60 % of the value", () => {
		const book: DiversificationHolding[] = [
			...oneYearBook().filter((h) => ["A", "B", "C"].includes(h.id)),
			{
				id: "HOUSE",
				valueBase: 200000,
				dailyBase: null,
				exclusion: "no_market_series",
			},
		];
		expect(computeWindow(book, ANCHOR, "1y").reading.status).toBe(
			"insufficient_history",
		);
	});
	it("refuses a window longer than the history", () => {
		expect(computeWindow(oneYearBook(), ANCHOR, "5y").reading.status).toBe(
			"insufficient_history",
		);
	});
});
