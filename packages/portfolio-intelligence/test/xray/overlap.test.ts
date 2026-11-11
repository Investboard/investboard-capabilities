import { describe, expect, it } from "vitest";
import { detectOverlaps } from "../../src/internal/xray/overlap.js";
import type { EngineEtfInput } from "../../src/internal/xray/types.js";
import { CORE, UNRESOLVED_ETF, WRLD } from "./fixtures.js";
function synthFund(
	ticker: string,
	constituents: EngineEtfInput["constituents"],
): EngineEtfInput {
	return { ...WRLD, isin: null, ticker, constituents };
}
describe("detectOverlaps", () => {
	it("finds shared constituents across ETFs on ISIN identity", () => {
		const pairs = detectOverlaps([WRLD, CORE]);
		expect(pairs).toHaveLength(1);
		const p = pairs[0]!;
		expect(p.etfA).toBe("WRLD.DE");
		expect(p.etfB).toBe("CORE.DE");
		expect(p.sharedCount).toBe(3);
		expect(p.overlapShare).toBeCloseTo(0.039 + 0.037 + 0.031, 6);
		expect(p.sharedTail).toBeNull();
		const aldr = p.sharedHoldings.find((h) => h.id === "isin:US1111111005")!;
		expect(aldr.weightInA).toBeCloseTo(0.039, 4);
		expect(aldr.weightInB).toBeCloseTo(0.046, 4);
	});
	it("drops pairs under the 1% noise floor and clamps to 1", () => {
		const a = {
			...WRLD,
			constituents: [
				{ identifier: "ZZZ", isin: null, name: "Z", weight: 0.001 },
			],
		};
		const b = {
			...CORE,
			constituents: [
				{ identifier: "ZZZ", isin: null, name: "Z", weight: 0.001 },
			],
		};
		expect(detectOverlaps([a, b])).toHaveLength(0);
	});
	it("caps sharedHoldings at 20 with a sharedTail", () => {
		const mk = (ticker: string) =>
			synthFund(
				ticker,
				Array.from({ length: 30 }, (_, i) => ({
					identifier: `C${i}`,
					isin: null,
					name: `C${i}`,
					weight: 0.01,
				})),
			);
		const pairs = detectOverlaps([mk("A.DE"), mk("B.DE")]);
		expect(pairs[0]!.sharedHoldings).toHaveLength(20);
		expect(pairs[0]!.sharedTail).toEqual({
			count: 10,
			weight: expect.closeTo(0.1, 4),
		});
	});
	it("ETFs with no constituents produce no pairs", () => {
		expect(detectOverlaps([WRLD, UNRESOLVED_ETF])).toHaveLength(0);
	});
	it("top sharedHoldings + sharedTail decompose overlapShare within rounding", () => {
		const mk = (ticker: string, offset: number) => ({
			ticker,
			isin: null,
			name: ticker,
			value: 10000,
			underlyingAssetClass: "equities",
			asOf: null,
			constituents: Array.from({ length: 25 }, (_, i) => ({
				identifier: `C${i}`,
				isin: null,
				name: `C${i}`,
				weight: 0.007 + (i * 7 + offset) * 0.000137,
			})),
		});
		const pairs = detectOverlaps([mk("A.DE", 1), mk("B.DE", 3)]);
		const p = pairs[0]!;
		const topSum = p.sharedHoldings.reduce(
			(s, h) => s + Math.min(h.weightInA, h.weightInB),
			0,
		);
		expect(topSum + (p.sharedTail?.weight ?? 0)).toBeCloseTo(p.overlapShare, 3);
	});
	it("parts sum ABOVE the clamped overlapShare on un-normalised weights (SHARED_TAIL_DOC)", () => {
		const overweight = (ticker: string) => ({
			ticker,
			isin: null,
			name: ticker,
			value: 10000,
			underlyingAssetClass: "equities",
			asOf: null,
			constituents: Array.from({ length: 3 }, (_, i) => ({
				identifier: `C${i}`,
				isin: null,
				name: `C${i}`,
				weight: 0.5,
			})),
		});
		const p = detectOverlaps([overweight("A.DE"), overweight("B.DE")])[0]!;
		expect(p.overlapShare).toBe(1);
		const partsSum =
			p.sharedHoldings.reduce(
				(s, h) => s + Math.min(h.weightInA, h.weightInB),
				0,
			) + (p.sharedTail?.weight ?? 0);
		expect(partsSum).toBeCloseTo(1.5, 6);
		expect(partsSum).toBeGreaterThan(p.overlapShare);
	});
	it("measures the COMMON weight (sum of per-name minima), never the average of one-sided shares", () => {
		const single = {
			...WRLD,
			ticker: "ONE.DE",
			constituents: [
				{
					identifier: "ELMT",
					isin: "US5555551040",
					name: "ELMTRON",
					weight: 1,
				},
			],
		};
		const broad = {
			...CORE,
			constituents: [
				{
					identifier: "ELMT",
					isin: "US5555551040",
					name: "ELMTRON",
					weight: 0.045,
				},
				{
					identifier: "OTHER",
					isin: "US0000000009",
					name: "Other",
					weight: 0.955,
				},
			],
		};
		const [p] = detectOverlaps([single, broad]);
		expect(p?.overlapShare).toBeCloseTo(0.045, 6);
		expect(p?.sharedHoldings[0]?.id).toBe("isin:US5555551040");
	});
	it("sums same-id constituents within one ETF and supports ticker-fallback identity", () => {
		const a = {
			...WRLD,
			constituents: [
				{ identifier: "DUP", isin: null, name: "Dup A-class", weight: 0.02 },
				{ identifier: "DUP", isin: null, name: "Dup B-class", weight: 0.03 },
			],
		};
		const b = {
			...CORE,
			constituents: [
				{ identifier: "DUP", isin: null, name: "Dup", weight: 0.04 },
			],
		};
		const pairs = detectOverlaps([a, b]);
		expect(pairs).toHaveLength(1);
		const dup = pairs[0]!.sharedHoldings.find((h) => h.id === "ticker:DUP")!;
		expect(dup.weightInA).toBeCloseTo(0.05, 4);
		expect(dup.weightInB).toBeCloseTo(0.04, 4);
	});
	it("keeps the tail exact when the rounded top sides overshoot the headline", () => {
		const mk = (ticker: string) =>
			synthFund(ticker, [
				...Array.from({ length: 20 }, (_, i) => ({
					identifier: `C${String(i).padStart(2, "0")}`,
					isin: null,
					name: `C${i}`,
					weight: 0.010050001,
				})),
				{ identifier: "TINY", isin: null, name: "Tiny", weight: 2e-7 },
			]);
		const p = detectOverlaps([mk("A.DE"), mk("B.DE")])[0]!;
		expect(p.sharedTail).toEqual({
			count: 1,
			weight: Number((2e-7).toFixed(4)),
		});
		expect(p.sharedTail?.weight).toBe(0);
		const topSum = p.sharedHoldings.reduce(
			(s, h) => s + Math.min(h.weightInA, h.weightInB),
			0,
		);
		expect(
			Math.abs(topSum + (p.sharedTail?.weight ?? 0) - p.overlapShare),
		).toBeLessThan(21 * 5e-5);
	});
	it("never floors a real tail to zero when the rounded top sides overshoot", () => {
		const mk = (ticker: string) =>
			synthFund(ticker, [
				...Array.from({ length: 20 }, (_, i) => ({
					identifier: `C${String(i).padStart(2, "0")}`,
					isin: null,
					name: `C${i}`,
					weight: 0.010050001,
				})),
				...Array.from({ length: 4 }, (_, i) => ({
					identifier: `T${i}`,
					isin: null,
					name: `T${i}`,
					weight: 0.0002,
				})),
			]);
		const p = detectOverlaps([mk("A.DE"), mk("B.DE")])[0]!;
		expect(p.sharedTail).toEqual({ count: 4, weight: 0.0008 });
	});
	it("ranks shared names deterministically, whatever order they arrive in", () => {
		const mk = (ticker: string, reversed: boolean, boosted: boolean) => {
			const constituents = Array.from({ length: 25 }, (_, i) => ({
				identifier: `C${String(i).padStart(2, "0")}`,
				isin: null,
				name: `C${i}`,
				weight: boosted && i === 24 ? 0.05 : 0.01,
			}));
			return synthFund(
				ticker,
				reversed ? [...constituents].reverse() : constituents,
			);
		};
		const forward = detectOverlaps([
			mk("A.DE", false, false),
			mk("B.DE", false, true),
		])[0]!;
		const backward = detectOverlaps([
			mk("A.DE", true, false),
			mk("B.DE", true, true),
		])[0]!;
		expect(forward.sharedHoldings.map((h) => h.id)).toEqual(
			backward.sharedHoldings.map((h) => h.id),
		);
		expect(forward.sharedHoldings[0]?.id).toBe("ticker:C24");
		expect(forward.sharedHoldings[1]?.id).toBe("ticker:C00");
		expect(forward.sharedHoldings.at(-1)?.id).toBe("ticker:C18");
	});
	it("never pairs one fund with itself when it is held in two accounts", () => {
		expect(detectOverlaps([WRLD, { ...WRLD }])).toHaveLength(0);
		expect(
			detectOverlaps([WRLD, { ...WRLD, ticker: "IE00BK5BQT80__EUR@XETR" }]),
		).toHaveLength(0);
		expect(
			detectOverlaps([WRLD, { ...WRLD, ticker: "  wrld.de  " }]),
		).toHaveLength(0);
		const pairs = detectOverlaps([WRLD, { ...WRLD }, CORE]);
		expect(pairs).toHaveLength(1);
		expect(pairs[0]?.etfA).toBe("WRLD.DE");
		expect(pairs[0]?.etfB).toBe("CORE.DE");
	});
	it("pairs two funds that share a ticker spelling under different ISINs", () => {
		const pairs = detectOverlaps([
			{ ...WRLD, ticker: "WORLD" },
			{ ...CORE, ticker: "world" },
		]);
		expect(pairs).toHaveLength(1);
		expect(pairs[0]?.sharedCount).toBe(3);
		expect(pairs[0]?.isinA).toBe("IESYN6451620");
		expect(pairs[0]?.isinB).toBe("IESYN4303130");
	});
	it("applies the 1 % floor to the COMMON weight, not the one-sided average", () => {
		const a = {
			...WRLD,
			constituents: [
				{ identifier: "XXX", isin: null, name: "X", weight: 0.052 },
			],
		};
		const b = {
			...CORE,
			constituents: [
				{ identifier: "XXX", isin: null, name: "X", weight: 0.008 },
			],
		};
		expect(detectOverlaps([a, b])).toHaveLength(0);
	});
});
