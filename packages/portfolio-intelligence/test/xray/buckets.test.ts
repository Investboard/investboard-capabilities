import { describe, expect, it } from "vitest";
import {
	currencyBuckets,
	holdingAssetClassBuckets,
} from "../../src/internal/xray/buckets.js";
import { dissolveEtfs } from "../../src/internal/xray/dissolve.js";
import { mergeByIdentity } from "../../src/internal/xray/merge.js";
import type {
	EngineDirectHolding,
	EngineEtfInput,
} from "../../src/internal/xray/types.js";
import { DIRECT_AAPL, DIRECT_GOLD, WRLD } from "./fixtures.js";
const stock = (
	ticker: string,
	assetClass: string,
	value: number,
	isin: string | null = null,
): EngineDirectHolding => ({ ticker, isin, name: ticker, value, assetClass });
const fund = (
	ticker: string,
	isin: string | null,
	underlyingAssetClass: string | null,
	value: number,
	constituents: EngineEtfInput["constituents"] = [],
): EngineEtfInput => ({
	ticker,
	isin,
	name: ticker,
	value,
	underlyingAssetClass,
	constituents,
	sectorVector: null,
	countryVector: null,
	asOf: null,
});
const LARCHHAUS = {
	identifier: "LRH",
	isin: "DESYN1494950",
	name: "Larchhaus",
};
const ALDER = { identifier: "ALDR", isin: "US1111111005", name: "Alder" };
describe("holdingAssetClassBuckets (the Basis line, by holding)", () => {
	it("files every holding whole in its class; weights are fractions of valuedTotal", () => {
		const total = WRLD.value + DIRECT_AAPL.value + DIRECT_GOLD.value;
		const { coverage, buckets } = holdingAssetClassBuckets(
			[DIRECT_AAPL, DIRECT_GOLD],
			[WRLD],
			total,
		);
		expect(coverage).toBe(1);
		const gold = buckets.find((b) => b.key === "gold")!;
		const equities = buckets.find((b) => b.key === "equities")!;
		expect(gold.weight).toBeCloseTo(DIRECT_GOLD.value / total, 4);
		expect(equities.value + gold.value).toBeCloseTo(total, 1);
		expect(buckets[0]!.weight).toBeGreaterThanOrEqual(buckets.at(-1)!.weight);
	});
	it("keeps a fund filed under real estate whole in real estate when an equity fund holds the same company", () => {
		const world = fund("WRLD.DE", "IESYN6451620", "equities", 90000, [
			{ ...LARCHHAUS, weight: 0.01 },
			{ ...ALDER, weight: 0.99 },
		]);
		const property = fund("IPRP.AS", "IESYN7134510", "real_estate", 10000, [
			{ ...LARCHHAUS, weight: 1 },
		]);
		const merged = mergeByIdentity(
			[],
			dissolveEtfs([world, property]).exposures,
			100000,
		);
		const onFilm = merged.find((p) => p.id === "isin:DESYN1494950");
		expect(onFilm?.assetClass).toBe("equities");
		expect(onFilm?.value).toBeCloseTo(900, 2);
		const { buckets } = holdingAssetClassBuckets([], [world, property], 100000);
		expect(buckets.map((b) => [b.key, b.weight])).toEqual([
			["equities", 0.9],
			["real_estate", 0.1],
		]);
	});
	it("keeps a REIT fund in real estate when the company is also held directly", () => {
		const direct = stock("LRH.DE", "equities", 5000, LARCHHAUS.isin);
		const property = fund("IPRP.AS", "IESYN7134510", "real_estate", 5000, [
			{ ...LARCHHAUS, weight: 1 },
		]);
		const { buckets } = holdingAssetClassBuckets([direct], [property], 10000);
		expect(Object.fromEntries(buckets.map((b) => [b.key, b.weight]))).toEqual({
			equities: 0.5,
			real_estate: 0.5,
		});
	});
	it("files a fund in the class the engine dissolves it under: a held-whole override, and no class read as equities", () => {
		const futures = {
			...fund("FUTR", "USSYN6940960", "alternatives", 4000),
			heldWholeAs: "commodities",
		};
		const unmapped = fund("NOCLASS", null, null, 6000);
		const { buckets } = holdingAssetClassBuckets(
			[],
			[futures, unmapped],
			10000,
		);
		const exposures = dissolveEtfs([futures, unmapped]).exposures;
		expect(Object.fromEntries(buckets.map((b) => [b.key, b.weight]))).toEqual({
			commodities: 0.4,
			equities: 0.6,
		});
		expect(exposures.map((e) => e.assetClass).sort()).toEqual([
			"commodities",
			"equities",
		]);
	});
	it("keeps an unclassified direct security in the hueless unknown slice", () => {
		const { buckets } = holdingAssetClassBuckets(
			[stock("X", "unknown", 100), stock("Y", "nonsense", 100)],
			[],
			200,
		);
		expect(buckets.map((b) => b.key).sort()).toEqual([
			"alternatives",
			"unknown",
		]);
	});
	it("folds one instrument held in two depots into one contributor", () => {
		const { buckets } = holdingAssetClassBuckets(
			[
				stock("MAPLE", "equities", 300, "DESYN3691660"),
				stock("MAPLE.DE", "equities", 100, "DESYN3691660"),
				stock("ALV", "equities", 100),
			],
			[],
			500,
		);
		expect(buckets[0]!.contributors).toEqual([
			{
				id: "isin:DESYN3691660",
				label: "MAPLE",
				isin: "DESYN3691660",
				weight: 0.8,
			},
			{ id: "ticker:ALV", label: "ALV", isin: null, weight: 0.2 },
		]);
	});
	it("caps contributors at 5 with a contributorsTail", () => {
		const rows = Array.from({ length: 8 }, (_, i) =>
			stock(`T${i}`, "equities", 100),
		);
		const { buckets } = holdingAssetClassBuckets(rows, [], 800);
		expect(buckets[0]!.contributors).toHaveLength(5);
		expect(buckets[0]!.contributorsTail).toEqual({
			count: 3,
			weight: expect.closeTo(0.375, 4),
		});
	});
	it("reconciles top-5 weights + tail weight exactly to the bucket weight (rounding bites)", () => {
		const value = 100 / 3;
		const valuedTotal = 7 * value;
		const rows = Array.from({ length: 7 }, (_, i) =>
			stock(`T${i}`, "equities", value),
		);
		const { buckets } = holdingAssetClassBuckets(rows, [], valuedTotal);
		const bucket = buckets[0]!;
		expect(bucket.contributorsTail).not.toBeNull();
		const topWeightSum = bucket.contributors.reduce((s, c) => s + c.weight, 0);
		const reconciled = Number(
			(topWeightSum + bucket.contributorsTail!.weight).toFixed(4),
		);
		expect(reconciled).toBe(bucket.weight);
	});
	it("pairs with the look-through: the merged positions under each class sum to that class's slice", () => {
		const world = fund("WRLD.DE", "IESYN6451620", "equities", 50000, [
			{ ...LARCHHAUS, weight: 0.02 },
			{ ...ALDER, weight: 0.9 },
		]);
		const property = fund("IPRP.AS", "IESYN7134510", "real_estate", 8000, [
			{ ...LARCHHAUS, weight: 0.6 },
		]);
		const futures = fund("FUTR", "USSYN6940960", "alternatives", 6000, [
			{
				identifier: "AGPXX",
				isin: "USSYN0683970",
				name: "Collateral",
				weight: 1,
			},
		]);
		const unmapped = fund("NOCLASS", null, null, 4000, [
			{ ...ALDER, weight: 1 },
		]);
		const direct = [
			stock("LRH.DE", "alternatives", 2000, LARCHHAUS.isin),
			stock("ALDR", "equities", 9000, ALDER.isin),
			stock("4GLD", "gold", 7000),
			stock("XYZ", "unknown", 3000),
		];
		const funds = [world, property, futures, unmapped];
		const total = 89000;
		const merged = mergeByIdentity(
			direct,
			dissolveEtfs(funds).exposures,
			total,
		);
		const mergedByClass = new Map<string, number>();
		for (const p of merged)
			mergedByClass.set(
				p.assetClass,
				(mergedByClass.get(p.assetClass) ?? 0) + p.value,
			);
		const { buckets } = holdingAssetClassBuckets(direct, funds, total);
		expect(buckets.map((b) => b.key).sort()).toEqual(
			[...mergedByClass.keys()].sort(),
		);
		for (const b of buckets)
			expect(mergedByClass.get(b.key), b.key).toBeCloseTo(b.value, 1);
	});
	it("returns an empty bucket list for empty input", () => {
		expect(holdingAssetClassBuckets([], [], 1000)).toEqual({
			coverage: 1,
			buckets: [],
		});
	});
});
describe("currencyBuckets", () => {
	it("buckets HOLDINGS by listing currency (never pro-rated through ETFs)", () => {
		const { buckets } = currencyBuckets(
			[
				{
					id: "ticker:WRLD.DE",
					name: "Synthetic All-World",
					isin: null,
					currency: "EUR",
					value: 50000,
				},
				{
					id: "isin:US1111111005",
					name: "Alder Inc.",
					isin: "US1111111005",
					currency: "USD",
					value: 10000,
				},
			],
			60000,
		);
		expect(buckets.map((b) => b.key)).toEqual(["EUR", "USD"]);
		expect(buckets[0]!.weight).toBeCloseTo(50000 / 60000, 4);
	});
	it("yields zero weights when valuedTotal is 0 (no division, no fabricated number)", () => {
		const { buckets } = currencyBuckets(
			[
				{
					id: "isin:US1111111005",
					name: "Alder Inc.",
					isin: "US1111111005",
					currency: "USD",
					value: 100,
				},
			],
			0,
		);
		expect(buckets).toHaveLength(1);
		expect(buckets[0]!.weight).toBe(0);
		expect(buckets[0]!.contributors[0]!.weight).toBe(0);
	});
});
