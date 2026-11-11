import { describe, expect, it } from "vitest";
import { evaluateInstrumentPair } from "../src/index.js";
import { pair } from "./fixtures.js";

describe("exact-listing common weekly observations", () => {
	it("compares two arbitrary listing currencies on one reporting-currency Friday grid", () => {
		const input = pair();
		input.series[1].basis = "price";
		const result = evaluateInstrumentPair(input);
		const c = result.correlations[0]!;
		expect(c.coefficient).toBeCloseTo(1, 12);
		expect(c.sampleCount).toBeGreaterThanOrEqual(50);
		expect(c.coverage).toBe(1);
		expect(c.currency).toBe("CHF");
		expect(c.leftBasis).toBe("distribution_adjusted");
		expect(c.rightBasis).toBe("price");
		expect(c.interval95?.[0]).toBeGreaterThan(0.99);
		expect(result.interpretation).toBe("descriptive_pair_not_portfolio_risk");
	});
	it("warns when a price-only series is compared with a distribution-adjusted series", () => {
		const same = evaluateInstrumentPair(pair());
		expect(same.reasons).not.toContain("mixed_return_basis");
		const input = pair();
		input.series[0].basis = "price";
		const mixed = evaluateInstrumentPair(input);
		expect(mixed.reasons).toContain("mixed_return_basis");
		expect(mixed.correlations[0]).toMatchObject({
			leftBasis: "price",
			rightBasis: "distribution_adjusted",
		});
		expect(mixed.correlations[0]!.coefficient).toBeCloseTo(1, 12);
		input.series[1].basis = "price";
		expect(evaluateInstrumentPair(input).reasons).not.toContain(
			"mixed_return_basis",
		);
	});
	it("allows a shared ticker on different exact venues and rejects a different-venue history", () => {
		const input = pair();
		input.listings[1].symbol = input.listings[0].symbol;
		input.series[1].listing.symbol = input.listings[0].symbol;
		expect(
			evaluateInstrumentPair(input).correlations[0]!.coefficient,
		).toBeCloseTo(1, 12);
		input.series[1].listing.exchange = "OTHER";
		expect(() => evaluateInstrumentPair(input)).toThrow("exact listing");
	});
	it("keeps missing weeks missing and does not bridge the next return over a missing week", () => {
		const input = pair();
		const baseline = evaluateInstrumentPair(input).correlations[0]!;
		input.series[1].points = input.series[1].points.filter(
			(p) => p.date < "2024-05-20" || p.date > "2024-06-02",
		);
		const c = evaluateInstrumentPair(input).correlations[0]!;
		expect(c.sampleCount).toBe(baseline.sampleCount - 3);
		expect(c.coverage).toBeLessThan(1);
	});
	it("withholds correlations for pre-inception, gaps, endpoint lag and zero variance", () => {
		for (const mode of ["inception", "gap", "endpoint", "constant"]) {
			const input = pair();
			if (mode === "inception")
				input.series[1].points = input.series[1].points.filter(
					(p) => p.date >= "2024-09-01",
				);
			if (mode === "gap")
				input.series[1].points = input.series[1].points.filter(
					(p) => p.date < "2024-02-01" || p.date > "2024-06-01",
				);
			if (mode === "endpoint")
				input.series[1].points = input.series[1].points.filter(
					(p) => p.date < "2024-11-01",
				);
			if (mode === "constant")
				input.series[1].points = input.series[1].points.map((p) => ({
					...p,
					value: 100,
				}));
			const c = evaluateInstrumentPair(input).correlations[0]!;
			expect(c.coefficient, mode).toBeNull();
			expect(c.interval95, mode).toBeNull();
			expect(c.quality.reasons.length).toBeGreaterThan(0);
		}
	});
	it("returns independently bounded 1/3/5/10-year samples without filling older history", () => {
		const input = pair();
		input.horizons = [1, 3, 5, 10];
		const result = evaluateInstrumentPair(input);
		expect(result.correlations).toHaveLength(4);
		expect(result.correlations[0]!.coefficient).not.toBeNull();
		for (const c of result.correlations.slice(1)) {
			expect(c.coefficient).toBeNull();
			expect(c.quality.reasons).toContain("short_history");
		}
	});
	it("does not silently invert an FX quote", () => {
		const input = pair();
		input.series[0].fx!.baseCurrency = "CHF";
		input.series[0].fx!.quoteCurrency = "GBP";
		expect(() => evaluateInstrumentPair(input)).toThrow("directly quote");
	});
});
