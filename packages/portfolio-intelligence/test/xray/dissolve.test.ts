import { describe, expect, it } from "vitest";
import { bookAsOf, dissolveEtfs } from "../../src/internal/xray/dissolve.js";
import type { EngineEtfInput } from "../../src/internal/xray/types.js";
import {
	FULLY_COVERED_ETF,
	NEARLY_FULLY_COVERED_ETF,
	UNRESOLVED_ETF,
	WRLD,
} from "./fixtures.js";
describe("dissolveEtfs", () => {
	it("emits one exposure row per constituent, valued by etf.value × weight", () => {
		const { exposures } = dissolveEtfs([WRLD]);
		const aldr = exposures.find((e) => e.id === "isin:US1111111005");
		expect(aldr).toBeDefined();
		expect(aldr!.value).toBeCloseTo(50000 * 0.039, 6);
		expect(aldr!.etf).toBe("WRLD.DE");
		expect(aldr!.shareInEtf).toBeCloseTo(0.039, 6);
		expect(aldr!.assetClass).toBe("equities");
	});
	it("closes the gap with a per-ETF residual row: value never vanishes", () => {
		const { exposures, dissolutions } = dissolveEtfs([WRLD]);
		const residual = exposures.find((e) => e.id === "residual:WRLD.DE");
		expect(residual).toBeDefined();
		expect(residual!.residual).toBe(true);
		const covered = 0.039 + 0.037 + 0.031 + 0.021;
		expect(residual!.value).toBeCloseTo(50000 * (1 - covered), 4);
		const total = exposures.reduce((s, e) => s + e.value, 0);
		expect(total).toBeCloseTo(50000, 4);
		expect(dissolutions[0]).toMatchObject({
			ticker: "WRLD.DE",
			status: "partial",
			asOf: "2026-06-08",
		});
		expect(dissolutions[0]!.coveredWeight).toBeCloseTo(covered, 6);
	});
	it('keeps a BLANK isin as "" while keying the row by ticker (merge.ts docblock)', () => {
		const blank: EngineEtfInput = {
			...WRLD,
			constituents: [
				{ identifier: "CASH", isin: "", name: "US DOLLAR", weight: 0.02 },
			],
		};
		const { exposures } = dissolveEtfs([blank]);
		const row = exposures.find((e) => e.id === "ticker:CASH");
		expect(row, "a blank ISIN must not mint an isin: key").toBeDefined();
		expect(row!.isin).toBe("");
		expect(exposures.some((e) => e.id.startsWith("isin:"))).toBe(false);
	});
	it("status full with NO residual when constituents sum to exactly 1.0", () => {
		const { exposures, dissolutions } = dissolveEtfs([FULLY_COVERED_ETF]);
		expect(dissolutions[0]!.status).toBe("full");
		expect(exposures.some((e) => e.residual)).toBe(false);
		const total = exposures.reduce((s, e) => s + e.value, 0);
		expect(total).toBeCloseTo(FULLY_COVERED_ETF.value, 4);
	});
	it("status full STILL emits a residual for the uncovered remainder in [0.98, 1): value never vanishes", () => {
		const { exposures, dissolutions } = dissolveEtfs([
			NEARLY_FULLY_COVERED_ETF,
		]);
		expect(dissolutions[0]!.status).toBe("full");
		expect(dissolutions[0]!.coveredWeight).toBeCloseTo(0.99, 6);
		const residual = exposures.find((e) => e.id === "residual:NEAR.DE");
		expect(residual).toBeDefined();
		expect(residual!.residual).toBe(true);
		expect(residual!.value).toBeCloseTo(100000 * 0.01, 4);
		expect(residual!.shareInEtf).toBeCloseTo(0.01, 6);
		expect(residual!.assetClass).toBe("equities");
		const total = exposures.reduce((s, e) => s + e.value, 0);
		expect(total).toBeCloseTo(100000, 4);
	});
	it("status none → the whole ETF becomes one residual row carrying its underlying class", () => {
		const { exposures, dissolutions } = dissolveEtfs([UNRESOLVED_ETF]);
		expect(dissolutions[0]!.status).toBe("none");
		expect(dissolutions[0]!.coveredWeight).toBe(0);
		expect(exposures).toHaveLength(1);
		expect(exposures[0]).toMatchObject({
			id: "residual:DARK.DE",
			value: 5000,
			assetClass: "bonds",
			residual: true,
		});
	});
	it("normalizes an over-100% payload: exposures reconcile to the ETF value, never inflate", () => {
		const etf = {
			...FULLY_COVERED_ETF,
			value: 50000,
			constituents: [
				{
					identifier: "AAA",
					isin: "US0000000001",
					name: "Alpha AG",
					weight: 0.8,
				},
				{
					identifier: "BBB",
					isin: "US0000000002",
					name: "Beta AG",
					weight: 0.8,
				},
			],
		};
		const { exposures, dissolutions } = dissolveEtfs([etf]);
		const total = exposures.reduce((s, e) => s + e.value, 0);
		expect(total).toBeCloseTo(50000, 4);
		expect(exposures).toHaveLength(2);
		expect(exposures[0]!.shareInEtf).toBeCloseTo(0.5, 6);
		expect(dissolutions[0]!.status).toBe("full");
		expect(dissolutions[0]!.coveredWeight).toBe(1);
	});
	it("drops identity-less constituents into the residual share", () => {
		const etf = {
			...FULLY_COVERED_ETF,
			constituents: [
				{ identifier: "", isin: null, name: "Mystery", weight: 0.5 },
				{ identifier: "AAA", isin: null, name: "Alpha AG", weight: 0.5 },
			],
		};
		const { exposures } = dissolveEtfs([etf]);
		expect(exposures.find((e) => e.id === "ticker:AAA")).toBeDefined();
		const residual = exposures.find((e) => e.residual);
		expect(residual!.value).toBeCloseTo(500, 4);
	});
	it("a degraded (fetch-failed) ETF carries degraded:true, status none, distinct from inherent opacity", () => {
		const degraded: EngineEtfInput = {
			...UNRESOLVED_ETF,
			ticker: "FAIL.DE",
			constituents: [],
			degraded: true,
		};
		const { dissolutions } = dissolveEtfs([degraded]);
		expect(dissolutions[0]!.status).toBe("none");
		expect(dissolutions[0]!.degraded).toBe(true);
	});
	it("an empty-but-successfully-fetched ETF carries degraded:false, same status, opposite discriminator", () => {
		const { dissolutions } = dissolveEtfs([UNRESOLVED_ETF]);
		expect(dissolutions[0]!.status).toBe("none");
		expect(dissolutions[0]!.degraded).toBe(false);
	});
	it("a normally-dissolved ETF carries degraded:false", () => {
		const { dissolutions } = dissolveEtfs([WRLD]);
		expect(dissolutions[0]!.degraded).toBe(false);
	});
});
describe("bookAsOf", () => {
	it("dates the book by its OLDEST constituent file, so no figure is newer than the Stand", () => {
		expect(
			bookAsOf([
				{ asOf: "2026-08-10" },
				{ asOf: "2026-08-01" },
				{ asOf: "2026-08-05" },
			]),
		).toBe("2026-08-01");
	});
	it("ignores a provider stamp that is not an ISO calendar date, which would otherwise win the minimum", () => {
		expect(
			bookAsOf([
				{ asOf: "09/30/2025" },
				{ asOf: "1970-01-01T00:00:00Z" },
				{ asOf: "2026-08-10" },
				{ asOf: "2026-08-05 00:00:00" },
			]),
		).toBe("1970-01-01T00:00:00Z");
		expect(bookAsOf([{ asOf: "09/30/2025" }, { asOf: "n/a" }])).toBeNull();
	});
	it("ignores undated funds and is null for a book with none dated", () => {
		expect(bookAsOf([{ asOf: null }, { asOf: "2026-08-10" }])).toBe(
			"2026-08-10",
		);
		expect(bookAsOf([{ asOf: null }, { asOf: null }])).toBeNull();
		expect(bookAsOf([])).toBeNull();
	});
});
