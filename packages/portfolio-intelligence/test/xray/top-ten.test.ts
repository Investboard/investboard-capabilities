import { describe, expect, it } from "vitest";
import { topTenBookConcentration } from "../../src/internal/xray/top-ten.js";
const row = (id: string, weight: number) => ({ id, weight });
const rows = (n: number, weight: number) =>
	Array.from({ length: n }, (_, i) => row(`isin:EQ${i}`, weight));
describe("topTenBookConcentration", () => {
	it("sums the ten largest and leaves the rest out", () => {
		const weights = [
			0.12, 0.11, 0.1, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01,
		];
		const book = weights.map((w, i) => row(`isin:EQ${i}`, w));
		expect(topTenBookConcentration(book)).toBe(0.75);
		expect(topTenBookConcentration(book)).toBeLessThan(0.78);
	});
	it("does not trust the caller's order", () => {
		const weights = [
			0.12, 0.11, 0.1, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01,
		];
		const ascending = [...weights]
			.sort((a, b) => a - b)
			.map((w, i) => row(`isin:EQ${i}`, w));
		expect(topTenBookConcentration(ascending)).toBe(0.75);
		expect(topTenBookConcentration(ascending)).not.toBe(0.55);
	});
	it("sums everything on a book of fewer than ten positions", () => {
		expect(topTenBookConcentration(rows(3, 0.2))).toBe(0.6);
		expect(topTenBookConcentration(rows(10, 0.05))).toBe(0.5);
	});
	it("returns zero for an empty book", () => {
		expect(topTenBookConcentration([])).toBe(0);
	});
	it("excludes residual remainder rows, and ranks without them", () => {
		const book = [row("residual:WRLD", 0.4), ...rows(10, 0.06)];
		expect(topTenBookConcentration(book)).toBe(0.6);
		expect(topTenBookConcentration(rows(10, 0.06))).toBe(0.6);
	});
	it("ignores a non-finite weight instead of poisoning the figure", () => {
		const book = [
			row("isin:EQ0", 0.3),
			row("isin:NAN", Number.NaN),
			row("isin:INF", Number.POSITIVE_INFINITY),
			row("isin:EQ1", 0.2),
		];
		expect(topTenBookConcentration(book)).toBe(0.5);
	});
	it("caps at 1", () => {
		expect(topTenBookConcentration(rows(12, 0.1))).toBe(1);
	});
	it("rounds to the merge engine's four-decimal weight precision", () => {
		const book = [row("isin:A", 0.123456), row("isin:B", 0.111111)];
		expect(topTenBookConcentration(book)).toBe(0.2346);
	});
});
