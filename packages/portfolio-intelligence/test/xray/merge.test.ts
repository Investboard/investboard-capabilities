import { describe, expect, it } from "vitest";
import { dissolveEtfs } from "../../src/internal/xray/dissolve.js";
import { isOffAxisClass } from "../../src/internal/xray/equity-axis.js";
import { mergeByIdentity } from "../../src/internal/xray/merge.js";
import type { EngineEtfInput } from "../../src/internal/xray/types.js";
import { DIRECT_AAPL, DIRECT_GOLD, CORE, WRLD } from "./fixtures.js";
describe("mergeByIdentity", () => {
	it("merges direct + ETF-derived exposure on ISIN identity with provenance", () => {
		const { exposures } = dissolveEtfs([WRLD, CORE]);
		const total = 10000 + 5000 + 50000 + 30000;
		const merged = mergeByIdentity(
			[DIRECT_AAPL, DIRECT_GOLD],
			exposures,
			total,
		);
		const aldr = merged.find((p) => p.id === "isin:US1111111005")!;
		const expectedValue = 10000 + 50000 * 0.039 + 30000 * 0.046;
		expect(aldr.value).toBeCloseTo(expectedValue, 2);
		expect(aldr.weight).toBeCloseTo(expectedValue / total, 4);
		expect(aldr.provenance.direct).toBeCloseTo(10000 / total, 4);
		expect(aldr.provenance.viaFunds).toHaveLength(2);
		const viaWrld = aldr.provenance.viaFunds.find((s) => s.etf === "WRLD.DE")!;
		expect(aldr.provenance.directValue).toBe(10000);
		expect(viaWrld.value).toBe(50000 * 0.039);
		expect(viaWrld.name).toBe(WRLD.name);
		expect(viaWrld.id).toBe(`isin:${WRLD.isin}`);
		expect(viaWrld.shareInEtf).toBeCloseTo(0.039, 4);
		expect(viaWrld.weight).toBeCloseTo((50000 * 0.039) / total, 4);
	});
	it("combines source listings by fund ISIN and keeps ticker collisions separate", () => {
		const aliases = dissolveEtfs([
			WRLD,
			{ ...WRLD, ticker: "ANOTHER-LISTING" },
		]);
		const same = mergeByIdentity([], aliases.exposures, 100000).find(
			(row) => row.id === "isin:US1111111005",
		);
		expect(same?.provenance.viaFunds).toHaveLength(1);
		expect(same?.provenance.viaFunds[0]?.value).toBeCloseTo(
			2 * WRLD.value * 0.039,
		);
		const collision = dissolveEtfs([WRLD, { ...CORE, ticker: WRLD.ticker }]);
		const different = mergeByIdentity(
			[],
			collision.exposures,
			WRLD.value + CORE.value,
		).find((row) => row.id === "isin:US1111111005");
		expect(different?.provenance.viaFunds).toHaveLength(2);
		expect(
			new Set(different?.provenance.viaFunds.map((row) => row.id)).size,
		).toBe(2);
	});
	it("does not collapse constituents keyed per asset, not per fund", () => {
		const { exposures } = dissolveEtfs([WRLD, CORE]);
		const merged = mergeByIdentity([], exposures, 80000);
		const nonResidual = merged.filter((p) => !p.id.startsWith("residual:"));
		expect(nonResidual.length).toBe(4);
	});
	it("keeps residual rows as their own positions", () => {
		const { exposures } = dissolveEtfs([WRLD]);
		const merged = mergeByIdentity([], exposures, 50000);
		expect(merged.find((p) => p.id === "residual:WRLD.DE")).toBeDefined();
	});
	it("sorts by weight descending and rounds (value 2dp, weight 4dp)", () => {
		const { exposures } = dissolveEtfs([WRLD]);
		const merged = mergeByIdentity([DIRECT_AAPL], exposures, 60000);
		for (let i = 1; i < merged.length; i++) {
			expect(merged[i - 1]!.weight).toBeGreaterThanOrEqual(merged[i]!.weight);
		}
		for (const p of merged) {
			expect(p.value).toBeCloseTo(Math.round(p.value * 100) / 100, 10);
			expect(p.weight).toBeCloseTo(Number(p.weight.toFixed(4)), 10);
		}
	});
	it("keeps an ISIN-less direct holding and its ISIN-keyed exposure APART", () => {
		const { exposures } = dissolveEtfs([WRLD]);
		const direct = { ...DIRECT_AAPL, isin: null };
		const merged = mergeByIdentity([direct], exposures, 60000);
		expect(merged.filter((p) => !p.id.startsWith("residual:"))).toHaveLength(5);
		const byTicker = merged.find((p) => p.id === "ticker:ALDR")!;
		const byIsin = merged.find((p) => p.id === "isin:US1111111005")!;
		expect(byTicker.isin).toBeNull();
		expect(byTicker.value).toBeCloseTo(10000, 2);
		expect(byTicker.provenance.viaFunds).toHaveLength(0);
		expect(byIsin.value).toBeCloseTo(50000 * 0.039, 2);
		expect(byIsin.provenance.direct).toBe(0);
	});
	it("defaults sektor and region to null (classification happens downstream)", () => {
		const { exposures } = dissolveEtfs([WRLD, CORE]);
		const merged = mergeByIdentity(
			[DIRECT_AAPL, DIRECT_GOLD],
			exposures,
			95000,
		);
		expect(merged.length).toBeGreaterThan(0);
		for (const p of merged) {
			expect(p.sektor).toBeNull();
			expect(p.region).toBeNull();
		}
	});
});
describe("mergeByIdentity: the class of a fund-derived identity", () => {
	const LARCHHAUS = "DESYN1494950";
	const INFRA = "GBSYN6568350";
	const fund = (
		ticker: string,
		underlyingAssetClass: string,
		constituents: Array<{
			isin: string;
			name: string;
			weight: number;
		}>,
	): EngineEtfInput => ({
		ticker,
		isin: null,
		name: ticker,
		value: 10000,
		underlyingAssetClass,
		constituents: constituents.map((c) => ({
			identifier: c.name,
			isin: c.isin,
			name: c.name,
			weight: c.weight,
		})),
		asOf: null,
	});
	const propertyFund = fund("PROP.DE", "real_estate", [
		{ isin: LARCHHAUS, name: "LARCHHAUS SE", weight: 1 },
	]);
	const worldFund = fund("WRLD.DE", "equities", [
		{ isin: LARCHHAUS, name: "LARCHHAUS SE", weight: 0.5 },
		{ isin: "US1111111005", name: "ALDER INC", weight: 0.5 },
	]);
	const infraFund = fund("INFS.L", "alternatives", [
		{ isin: INFRA, name: "9Z INFRASTRUCTURE", weight: 1 },
	]);
	const bondFund = fund("GOVT.DE", "bonds", [
		{ isin: INFRA, name: "9Z INFRASTRUCTURE", weight: 1 },
	]);
	it.each([
		{ order: "the property fund first", etfs: [propertyFund, worldFund] },
		{ order: "the world fund first", etfs: [worldFund, propertyFund] },
	])("reads a name held through an equity fund as a listed company, with $order", ({
		etfs,
	}) => {
		const { exposures } = dissolveEtfs(etfs);
		const merged = mergeByIdentity([], exposures, 20000);
		const larchhaus = merged.find((p) => p.id === `isin:${LARCHHAUS}`);
		expect(larchhaus?.assetClass).toBe("equities");
		expect(isOffAxisClass(larchhaus?.assetClass)).toBe(false);
		expect(larchhaus?.value).toBeCloseTo(15000, 2);
	});
	it.each([
		{ order: "the infrastructure fund first", etfs: [infraFund, bondFund] },
		{ order: "the bond fund first", etfs: [bondFund, infraFund] },
	])("leaves a name held ONLY through off-axis funds off the equity axis, with $order", ({
		etfs,
	}) => {
		const { exposures } = dissolveEtfs(etfs);
		const merged = mergeByIdentity([], exposures, 20000);
		const held = merged.find((p) => p.id === `isin:${INFRA}`);
		expect(isOffAxisClass(held?.assetClass)).toBe(true);
	});
	it("keeps the DIRECT leg's off-axis class when an equity fund holds the same name (the accepted limitation, pinned)", () => {
		const { exposures } = dissolveEtfs([worldFund]);
		const merged = mergeByIdentity(
			[
				{
					ticker: "LRH",
					isin: LARCHHAUS,
					name: "Larchhaus SE",
					value: 5000,
					assetClass: "alternatives",
				},
			],
			exposures,
			25000,
		);
		const larchhaus = merged.find((p) => p.id === `isin:${LARCHHAUS}`);
		expect(larchhaus?.assetClass).toBe("alternatives");
		expect(larchhaus?.provenance.direct).toBeGreaterThan(0);
	});
});
