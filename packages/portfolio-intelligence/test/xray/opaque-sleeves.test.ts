import { describe, expect, it } from "vitest";
import {
	deriveOpaqueSleeves,
	type OpaqueSleeveInput,
} from "../../src/internal/xray/opaque-sleeves.js";
const sleeve = (over: Partial<OpaqueSleeveInput>): OpaqueSleeveInput => ({
	ticker: "X",
	name: "X",
	value: 100,
	coveredWeight: 0,
	degraded: false,
	assetClass: "equities",
	...over,
});
describe("deriveOpaqueSleeves", () => {
	it("emits NO sleeve for a fully-covered ETF (residual below the floor)", () => {
		const out = deriveOpaqueSleeves(
			[sleeve({ ticker: "WRLD", value: 100, coveredWeight: 1 })],
			100,
		);
		expect(out).toEqual([]);
	});
	it("emits NO sleeve when bookValue is non-positive (empty-safe)", () => {
		expect(deriveOpaqueSleeves([sleeve({ coveredWeight: 0 })], 0)).toEqual([]);
	});
	it("weights an inherent sleeve by its UNCOVERED value over the book", () => {
		const out = deriveOpaqueSleeves(
			[
				sleeve({
					ticker: "MM",
					value: 100,
					coveredWeight: 0,
					assetClass: "cash",
				}),
			],
			200,
		);
		expect(out).toHaveLength(1);
		expect(out[0]?.weight).toBeCloseTo(0.5, 6);
		expect(out[0]?.kind).toBe("inherent");
	});
	it("routes a DEGRADED sleeve to pending with the fixed pending reason key", () => {
		const out = deriveOpaqueSleeves(
			[
				sleeve({
					ticker: "FLAKY",
					value: 50,
					coveredWeight: 0,
					degraded: true,
				}),
			],
			100,
		);
		expect(out[0]?.kind).toBe("pending");
		expect(out[0]?.reason).toBe("pending");
	});
	it("a degraded sleeve is pending even when its underlying class is cash", () => {
		const out = deriveOpaqueSleeves(
			[
				sleeve({
					ticker: "FLAKY",
					value: 50,
					coveredWeight: 0,
					degraded: true,
					assetClass: "cash",
				}),
			],
			100,
		);
		expect(out[0]?.kind).toBe("pending");
	});
	it("keys inherent reasons by underlying asset class", () => {
		const out = deriveOpaqueSleeves(
			[
				sleeve({ ticker: "MM", coveredWeight: 0, assetClass: "cash" }),
				sleeve({ ticker: "BND", coveredWeight: 0, assetClass: "bonds" }),
				sleeve({ ticker: "ALT", coveredWeight: 0, assetClass: "commodities" }),
			],
			1000,
		);
		const byTicker = new Map(out.map((s) => [s.ticker, s.reason]));
		expect(byTicker.get("MM")).toBe("money-market");
		expect(byTicker.get("BND")).toBe("bond-fund");
		expect(byTicker.get("ALT")).toBe("held-whole");
	});
	it("only the UNCOVERED residual of a partially-covered sleeve is opaque", () => {
		const out = deriveOpaqueSleeves(
			[sleeve({ ticker: "P", value: 100, coveredWeight: 0.6 })],
			100,
		);
		expect(out).toHaveLength(1);
		expect(out[0]?.weight).toBeCloseTo(0.4, 6);
		expect(out[0]?.kind).toBe("inherent");
	});
	it("reports a genuine percent-scale residual (a 0.99-covered ETF is a real gap)", () => {
		const out = deriveOpaqueSleeves(
			[sleeve({ ticker: "ALMOST", value: 100, coveredWeight: 0.99 })],
			100,
		);
		expect(out).toHaveLength(1);
		expect(out[0]?.weight).toBeCloseTo(0.01, 6);
	});
	it("drops a float-noise residual (a fully-covered ETF rounding just shy of 1.0)", () => {
		const out = deriveOpaqueSleeves(
			[sleeve({ ticker: "FULL", value: 100, coveredWeight: 1 - 1e-9 })],
			100,
		);
		expect(out).toEqual([]);
	});
	it("propagates the underlying assetClass onto the emitted sleeve (drives the engine carve)", () => {
		const out = deriveOpaqueSleeves(
			[
				sleeve({ ticker: "BND", coveredWeight: 0, assetClass: "bonds" }),
				sleeve({ ticker: "GLD", coveredWeight: 0, assetClass: "gold" }),
			],
			200,
		);
		const byTicker = new Map(out.map((s) => [s.ticker, s.assetClass]));
		expect(byTicker.get("BND")).toBe("bonds");
		expect(byTicker.get("GLD")).toBe("gold");
	});
	it("emits a reason KEY, never a sentence: the engine carries no language", () => {
		const [pending, cash, bonds, whole] = deriveOpaqueSleeves(
			[
				sleeve({ ticker: "A", degraded: true }),
				sleeve({ ticker: "B", assetClass: "cash" }),
				sleeve({ ticker: "C", assetClass: "bonds" }),
				sleeve({ ticker: "D" }),
			],
			400,
		);
		expect(pending?.reasonKey).toBe("pending");
		expect(cash?.reasonKey).toBe("money-market");
		expect(bonds?.reasonKey).toBe("bond-fund");
		expect(whole?.reasonKey).toBe("held-whole");
		for (const s of [pending, cash, bonds, whole])
			expect(s?.reason).toBe(s?.reasonKey);
	});
});
