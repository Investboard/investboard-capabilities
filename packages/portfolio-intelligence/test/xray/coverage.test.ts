import { describe, expect, it } from "vitest";
import { computeBookCoverage } from "../../src/internal/xray/coverage.js";
const etf = (
	value: number,
	coveredWeight: number,
	degraded = false,
	hasEquity = true,
) => ({ value, coveredWeight, degraded, hasEquityConstituents: hasEquity });
describe("computeBookCoverage", () => {
	it("splits the book into transparent vs opaque by value-weight", () => {
		const c = computeBookCoverage(
			[etf(100, 0.9), etf(100, 0, false, false)],
			200,
		);
		expect(c.transparent).toBeCloseTo(0.45, 5);
		expect(c.opaqueInherent).toBeCloseTo(0.55, 5);
		expect(c.opaquePending).toBe(0);
		expect(c.transparent + c.opaqueInherent + c.opaquePending).toBeCloseTo(
			1,
			5,
		);
	});
	it("classifies each sleeve's residual per-ETF: a DEGRADED sleeve → pending, a clean one → inherent", () => {
		const c = computeBookCoverage(
			[etf(100, 0.9), etf(100, 0, true, false)],
			200,
		);
		expect(c.transparent).toBeCloseTo(0.45, 5);
		expect(c.opaqueInherent).toBeCloseTo(0.05, 5);
		expect(c.opaquePending).toBeCloseTo(0.5, 5);
		expect(c.transparent + c.opaqueInherent + c.opaquePending).toBeCloseTo(
			1,
			5,
		);
	});
	it("folds direct (non-ETF) value into transparent", () => {
		const c = computeBookCoverage([etf(100, 0.5)], 200);
		expect(c.transparent).toBeCloseTo(0.75, 5);
		expect(c.opaqueInherent).toBeCloseTo(0.25, 5);
	});
	it("is empty-safe", () => {
		expect(computeBookCoverage([], 0)).toEqual({
			transparent: 0,
			opaqueInherent: 0,
			opaquePending: 0,
		});
	});
	it("rejects a non-finite bookValue (NaN / Infinity) as zeros, never emits NaN fractions", () => {
		const etfs = [etf(100, 0.5)];
		expect(computeBookCoverage(etfs, Number.NaN)).toEqual({
			transparent: 0,
			opaqueInherent: 0,
			opaquePending: 0,
		});
		expect(computeBookCoverage(etfs, Number.POSITIVE_INFINITY)).toEqual({
			transparent: 0,
			opaqueInherent: 0,
			opaquePending: 0,
		});
	});
});
