import { describe, expect, it } from "vitest";
import { buildIssuerVector } from "../../src/internal/concentration/issuer-vector.js";
import {
	evaluateLegA,
	isApproachingCap,
	isBookSeenThrough,
	verdictAtCap,
} from "../../src/internal/concentration/leg-a.js";
import type { ConcentrationPosition } from "../../src/internal/concentration/types.js";
const pos = (
	p: Partial<ConcentrationPosition> &
		Pick<ConcentrationPosition, "issuerId" | "value">,
): ConcentrationPosition => ({
	issuerName: p.issuerId,
	assetClass: "equities",
	isResidual: false,
	isUnvalued: false,
	...p,
});
describe("evaluateLegA: residual is never a breach (IOB-1 regression)", () => {
	it("a single covered ETF whose 18% residual exceeds the cap does NOT fabricate a breach", () => {
		const r = evaluateLegA({
			positions: [
				pos({ issuerId: "037833", issuerName: "Alder", value: 41 }),
				pos({ issuerId: "594918", issuerName: "Cedarsoft", value: 41 }),
				pos({ issuerId: "023135", issuerName: "Rivermart", value: 41 }),
				pos({ issuerId: "02079K", issuerName: "Alphanumeric", value: 41 }),
				pos({ issuerId: "30303M", issuerName: "Meta", value: 41 }),
				pos({
					issuerId: "residual:CORE",
					issuerName: "Synthetic Core World",
					value: 45,
					isResidual: true,
				}),
			],
			capPct: 10,
		});
		expect(r.coverage).toBeCloseTo(0.82, 6);
		expect(r.refusal).toBeNull();
		expect(r.issuers.some((i) => i.issuerId.startsWith("residual:"))).toBe(
			false,
		);
		expect(r.maxIssuer?.issuerName).toBe("Alder");
		expect(r.maxIssuer?.weight).toBeCloseTo(0.164, 6);
	});
	it("an all-residual / cash / bond book (no named issuers) refuses, never a breach", () => {
		const r = evaluateLegA({
			positions: [
				pos({ issuerId: "residual:CORE", value: 60, isResidual: true }),
				pos({ issuerId: "CASH", value: 30, assetClass: "cash" }),
				pos({ issuerId: "BUND", value: 10, assetClass: "bonds" }),
			],
			capPct: 10,
		});
		expect(r.maxIssuer).toBeNull();
		expect(r.refusal).toBe("coverage_below_floor");
		expect(r.breached).toBe(false);
	});
});
describe("evaluateLegA: coverage refuse-floor is asymmetric", () => {
	it("refuses below 80% attribution when nothing measured breaches", () => {
		const r = evaluateLegA({
			positions: [
				pos({ issuerId: "AAA", value: 5 }),
				pos({ issuerId: "BBB", value: 74 }),
				pos({ issuerId: "residual:CORE", value: 21, isResidual: true }),
			],
			capPct: 80,
		});
		expect(r.coverage).toBeCloseTo(0.79, 6);
		expect(r.maxIssuer).toBeNull();
		expect(r.refusal).toBe("coverage_below_floor");
		expect(r.breached).toBe(false);
	});
	it("computes at exactly 80% attribution", () => {
		const r = evaluateLegA({
			positions: [
				pos({ issuerId: "AAA", value: 80 }),
				pos({ issuerId: "residual:CORE", value: 20, isResidual: true }),
			],
			capPct: 100,
		});
		expect(r.coverage).toBeCloseTo(0.8, 6);
		expect(r.refusal).toBeNull();
		expect(r.maxIssuer?.weight).toBeCloseTo(0.8, 6);
	});
	it("NEVER suppresses a measured breach, however thin the attribution", () => {
		const r = evaluateLegA({
			positions: [
				pos({ issuerId: "AAA", value: 12 }),
				pos({ issuerId: "residual:CORE", value: 88, isResidual: true }),
			],
			capPct: 10,
		});
		expect(r.coverage).toBeCloseTo(0.12, 6);
		expect(r.refusal).toBeNull();
		expect(r.breached).toBe(true);
		expect(r.maxIssuer?.weight).toBeCloseTo(0.12, 6);
	});
});
describe("evaluateLegA: state machine", () => {
	it("fires strictly above the cap, not at it", () => {
		const over = evaluateLegA({
			positions: [
				pos({ issuerId: "A", value: 11 }),
				pos({ issuerId: "B", value: 89 }),
			],
			capPct: 10,
		});
		expect(over.maxIssuer?.issuerId).toBe("B");
		expect(over.breached).toBe(true);
	});
	it("flags approaching at 75% of the line and not breached", () => {
		const clean = evaluateLegA({
			positions: Array.from({ length: 13 }, (_, i) =>
				pos({ issuerId: `i${i}`, value: i === 0 ? 8 : 92 / 12 }),
			),
			capPct: 10,
		});
		expect(clean.maxIssuer?.weight).toBeCloseTo(0.08, 6);
		expect(clean.approaching).toBe(true);
		expect(clean.breached).toBe(false);
	});
});
describe("evaluateLegA: HHI and effective-N", () => {
	it("computes HHI = sum of w squared and effectiveN = 1/HHI", () => {
		const r = evaluateLegA({
			positions: [
				pos({ issuerId: "A", value: 50 }),
				pos({ issuerId: "B", value: 50 }),
			],
			capPct: 10,
		});
		expect(r.hhi).toBeCloseTo(0.5, 6);
		expect(r.effectiveN).toBeCloseTo(2, 6);
	});
});
describe("evaluateLegA: edge cases", () => {
	it("treats a single-holding book as 100% and breached", () => {
		const r = evaluateLegA({
			positions: [pos({ issuerId: "ONLY", value: 100 })],
			capPct: 10,
		});
		expect(r.maxIssuer?.weight).toBeCloseTo(1, 6);
		expect(r.breached).toBe(true);
	});
	it("a bond-heavy and cash-heavy book is measured on its equity alone", () => {
		const r = evaluateLegA({
			positions: [
				pos({ issuerId: "BUND", value: 80, assetClass: "bonds" }),
				pos({ issuerId: "CASH", value: 10, assetClass: "cash" }),
				pos({ issuerId: "AAA", value: 10 }),
			],
			capPct: 10,
		});
		expect(r.maxIssuer?.issuerId).toBe("AAA");
		expect(r.maxIssuer?.weight).toBeCloseTo(1, 6);
		expect(r.breached).toBe(true);
	});
	it("refuses on an empty book", () => {
		const r = evaluateLegA({ positions: [], capPct: 10 });
		expect(r.maxIssuer).toBeNull();
		expect(r.refusal).toBe("empty_book");
		expect(r.hhi).toBe(0);
		expect(r.effectiveN).toBeNull();
	});
	it("refuses with empty_book when the book holds no equity at all", () => {
		const r = evaluateLegA({
			positions: [pos({ issuerId: "GOLD", value: 100, assetClass: "gold" })],
			capPct: 10,
		});
		expect(r.refusal).toBe("empty_book");
	});
});
describe("verdictAtCap: one implementation of the cap-dependent verdict", () => {
	const books: Record<string, ConcentrationPosition[]> = {
		"fully attributed, calm": [
			pos({ issuerId: "AAA", value: 6 }),
			pos({ issuerId: "BBB", value: 47 }),
			pos({ issuerId: "CCC", value: 47 }),
		],
		"fully attributed, concentrated": [
			pos({ issuerId: "AAA", value: 88 }),
			pos({ issuerId: "BBB", value: 12 }),
		],
		"below the coverage floor, nothing measured breaches at cap 10": [
			pos({ issuerId: "AAA", value: 100 }),
			pos({ issuerId: "BBB", value: 50 }),
			pos({ issuerId: "residual:CORE", value: 850, isResidual: true }),
		],
		"below the coverage floor, a measured breach at cap 10": [
			pos({ issuerId: "AAA", value: 200 }),
			pos({ issuerId: "residual:CORE", value: 800, isResidual: true }),
		],
		"an equity book we could not attribute at all": [
			pos({ issuerId: "residual:CORE", value: 100, isResidual: true }),
		],
		"no equity book at all": [
			pos({ issuerId: "CASH", value: 100, assetClass: "cash" }),
		],
		empty: [],
	};
	const caps = [1, 3, 5, 8, 10, 15, 25, 40, 50, 51, 100];
	for (const [name, positions] of Object.entries(books)) {
		it(`agrees with evaluateLegA across the cap range: ${name}`, () => {
			const vector = buildIssuerVector(positions);
			const maxIssuer = vector.issuers[0];
			for (const capPct of caps) {
				const full = evaluateLegA({ positions, capPct });
				if (maxIssuer === undefined) {
					expect({ capPct, refusal: full.refusal }).toEqual({
						capPct,
						refusal:
							vector.attributed + vector.unattributed > 0
								? "coverage_below_floor"
								: "empty_book",
					});
					expect(full.maxIssuer).toBeNull();
					expect(full.breached).toBe(false);
					expect(full.approaching).toBe(false);
					continue;
				}
				const verdict = verdictAtCap({
					maxIssuer,
					coverage: vector.attributed,
					capFraction: capPct / 100,
				});
				expect({ capPct, ...verdict }).toEqual({
					capPct,
					maxIssuer: full.maxIssuer,
					breached: full.breached,
					approaching: full.approaching,
					refusal: full.refusal,
				});
			}
		});
	}
});
describe("isApproachingCap: the band is compared in basis points", () => {
	it("an issuer exactly on the 75 % line is approaching at every legal cap", () => {
		const missed: number[] = [];
		for (let capPct = 1; capPct <= 100; capPct++) {
			const capFraction = capPct / 100;
			const onTheLine = Math.round(0.75 * capFraction * 10000) / 10000;
			if (!isApproachingCap(onTheLine, capFraction)) missed.push(capPct);
		}
		expect(missed).toEqual([]);
	});
	it("the pre-fix float comparison missed 19 of those caps (negative control)", () => {
		const missedByFloats: number[] = [];
		for (let capPct = 1; capPct <= 100; capPct++) {
			const capFraction = capPct / 100;
			const onTheLine = Math.round(0.75 * capFraction * 10000) / 10000;
			if (!(onTheLine >= 0.75 * capFraction)) missedByFloats.push(capPct);
		}
		expect(missedByFloats).toEqual([
			5, 7, 10, 14, 19, 20, 23, 28, 38, 40, 46, 55, 56, 63, 65, 67, 76, 80, 92,
		]);
	});
	it("a weight a basis point below the line is not approaching", () => {
		expect(isApproachingCap(0.2999, 0.4)).toBe(false);
		expect(isApproachingCap(0.3, 0.4)).toBe(true);
	});
	it("stays below the band above the line and rounds no breach into it", () => {
		expect(isApproachingCap(0.375, 0.5)).toBe(true);
		expect(isApproachingCap(0.375, 0.51)).toBe(false);
	});
	it("a breached weight also satisfies the band, so callers must gate on !breached", () => {
		expect(isApproachingCap(0.9, 0.1)).toBe(true);
		expect(
			verdictAtCap({
				maxIssuer: { issuerId: "AAA", issuerName: "AAA", weight: 0.9 },
				coverage: 1,
				capFraction: 0.1,
			}),
		).toEqual({
			maxIssuer: { issuerId: "AAA", issuerName: "AAA", weight: 0.9 },
			breached: true,
			approaching: false,
			refusal: null,
		});
	});
});
describe("isBookSeenThrough: the cap-INDEPENDENT honesty gate", () => {
	const issuer = (weight: number) => ({
		issuerId: "AAA",
		issuerName: "AAA",
		weight,
	});
	it("refuses a book below the coverage floor whatever the cap does to Leg A", () => {
		const book = { issuers: [issuer(0.07)], coverage: 0.6 };
		expect(
			verdictAtCap({
				maxIssuer: issuer(0.07),
				coverage: 0.6,
				capFraction: 0.05,
			}).refusal,
		).toBeNull();
		expect(isBookSeenThrough(book)).toBe(false);
	});
	it("stands behind a book at or above the floor", () => {
		expect(isBookSeenThrough({ issuers: [issuer(0.5)], coverage: 0.8 })).toBe(
			true,
		);
		expect(isBookSeenThrough({ issuers: [issuer(0.5)], coverage: 1 })).toBe(
			true,
		);
		expect(
			isBookSeenThrough({ issuers: [issuer(0.5)], coverage: 0.7999 }),
		).toBe(false);
	});
	it("refuses an empty vector: there is nothing to measure", () => {
		expect(isBookSeenThrough({ issuers: [], coverage: 0 })).toBe(false);
		expect(isBookSeenThrough({ issuers: [], coverage: 1 })).toBe(false);
	});
});
