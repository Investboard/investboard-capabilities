import { describe, expect, it } from "vitest";
import {
	applyProfilesToFunds,
	computeDimensions,
} from "../src/internal/dimensions/dimensions.js";
import {
	profileMap,
	type ValuedHolding,
} from "../src/internal/resolve/security-profile.js";
import type {
	EngineDirectHolding,
	EngineEtfInput,
} from "../src/internal/xray/types.js";

function etf(overrides: Partial<EngineEtfInput>): EngineEtfInput {
	return {
		ticker: "T",
		isin: null,
		name: "n",
		value: 1000,
		underlyingAssetClass: "equities",
		constituents: [],
		sectorVector: null,
		countryVector: null,
		asOf: null,
		...overrides,
	};
}

describe("applyProfilesToFunds: constituent profiles re-base a fund's breakdown", () => {
	it("replaces an equity fund's breakdown with its constituents' profiles", () => {
		const [out] = applyProfilesToFunds(
			[
				etf({
					constituents: [
						{
							identifier: "SYSC",
							isin: "TWSYN0000010",
							name: "Synthetic Semiconductor",
							weight: 0.6,
						},
						{
							identifier: "SYMM",
							isin: "KRSYN0000020",
							name: "Synthetic Memory",
							weight: 0.4,
						},
					],
					sectorVector: [{ key: "energy", weight: 1 }],
				}),
			],
			profileMap([
				{ isin: "TWSYN0000010", country: "TW", sector: "Technology" },
				{ isin: "KRSYN0000020", country: "KR", sector: "Technology" },
			]),
		);
		const country = new Map(out?.countryVector?.map((e) => [e.key, e.weight]));
		expect(country.get("TW")).toBeCloseTo(0.6, 10);
		expect(country.get("KR")).toBeCloseTo(0.4, 10);
		expect(out?.sectorVector?.map((e) => e.key)).not.toContain("energy");
		expect(out?.sectorVector?.[0]?.weight).toBeCloseTo(1, 10);
	});

	it("treats a fund with no class as equities", () => {
		const [out] = applyProfilesToFunds(
			[
				etf({
					underlyingAssetClass: null,
					constituents: [
						{
							identifier: "ALDR",
							isin: "US1111110005",
							name: "ALDR",
							weight: 1,
						},
					],
					countryVector: [{ key: "JP", weight: 1 }],
				}),
			],
			profileMap([
				{ isin: "US1111110005", country: "US", sector: "Technology" },
			]),
		);
		expect(out?.countryVector).toEqual([{ key: "US", weight: 1 }]);
		expect(out?.sectorVector).toEqual([{ key: "technology", weight: 1 }]);
	});

	it("leaves a bond fund untouched", () => {
		const bond = etf({
			underlyingAssetClass: "bonds",
			constituents: [
				{ identifier: "b", isin: "US1111110005", name: "b", weight: 1 },
			],
			countryVector: [{ key: "US", weight: 1 }],
		});
		const [out] = applyProfilesToFunds(
			[bond],
			profileMap([
				{ isin: "US1111110005", country: "DE", sector: "Technology" },
			]),
		);
		expect(out).toBe(bond);
	});

	it("keeps the fund's own breakdown when no constituent has a profile", () => {
		const unresolved = etf({
			isin: "B",
			constituents: [
				{ identifier: "?", isin: "NOTINPROFILES9", name: "?", weight: 1 },
			],
			countryVector: [{ key: "JP", weight: 1 }],
		});
		const [out] = applyProfilesToFunds(
			[unresolved],
			profileMap([
				{ isin: "US1111110005", country: "US", sector: "Technology" },
			]),
		);
		expect(out).toBe(unresolved);
	});

	it("keeps each dimension separately: an industry-only profile leaves country and sector alone", () => {
		const country = [{ key: "US", weight: 0.9 }];
		const sector = [{ key: "technology", weight: 0.8 }];
		const [out] = applyProfilesToFunds(
			[
				etf({
					constituents: [
						{ identifier: "X", isin: "XX0000000001", name: "X", weight: 1 },
					],
					countryVector: country,
					sectorVector: sector,
				}),
			],
			profileMap([
				{
					isin: "XX0000000001",
					country: null,
					sector: "Totally Not A Sector",
					industry: "Semiconductors",
				},
			]),
		);
		expect(out?.countryVector).toEqual(country);
		expect(out?.sectorVector).toEqual(sector);
		expect(out?.industryVector).toEqual([{ key: "Semiconductors", weight: 1 }]);
	});
});

function holding(
	overrides: Partial<ValuedHolding> & Pick<ValuedHolding, "id">,
): ValuedHolding {
	return {
		kind: "security",
		name: overrides.id,
		value: 100,
		listingCurrency: "EUR",
		assetClass: "equities",
		...overrides,
	};
}

function direct(overrides: Partial<EngineDirectHolding>): EngineDirectHolding {
	return {
		ticker: "X",
		isin: null,
		name: "X",
		value: 100,
		assetClass: "equities",
		sector: null,
		country: null,
		...overrides,
	};
}

describe("computeDimensions", () => {
	it("describes the equity part only: bond value never enters a sector, country or region", () => {
		const dims = computeDimensions({
			etfInputs: [],
			direct: [
				direct({
					ticker: "EQ",
					value: 50,
					sector: "technology",
					country: "US",
				}),
				direct({
					ticker: "BD",
					value: 50,
					assetClass: "bonds",
					sector: null,
					country: "DE",
				}),
			],
			valued: [
				holding({ id: "EQ", value: 50 }),
				holding({ id: "BD", value: 50, assetClass: "bonds" }),
			],
			valuedTotal: 100,
		});
		const sum = (buckets: { value: number }[]) =>
			buckets.reduce((s, b) => s + b.value, 0);
		expect(sum(dims.sector.buckets)).toBeCloseTo(50, 6);
		expect(sum(dims.country.buckets)).toBeCloseTo(50, 6);
		expect(sum(dims.region.buckets)).toBeCloseTo(50, 6);
		expect(dims.sector.buckets).toEqual([
			{ key: "technology", value: 50, weight: 0.5 },
		]);
		expect(dims.sector.coverage).toBe(1);
	});

	it("keeps an unclassified equity visible as unknown and lowers coverage", () => {
		const dims = computeDimensions({
			etfInputs: [],
			direct: [
				direct({ ticker: "A", value: 60, sector: "technology", country: "US" }),
				direct({ ticker: "B", value: 40 }),
			],
			valued: [
				holding({ id: "A", value: 60 }),
				holding({ id: "B", value: 40 }),
			],
			valuedTotal: 100,
		});
		expect(dims.sector.buckets.at(-1)).toEqual({
			key: "unknown",
			value: 40,
			weight: 0.4,
		});
		expect(dims.sector.coverage).toBeCloseTo(0.6, 10);
	});

	it("spreads a fund by its breakdown and keeps the unbroken-down rest unknown", () => {
		const dims = computeDimensions({
			etfInputs: [
				etf({
					ticker: "WRLD",
					value: 1000,
					sectorVector: [{ key: "technology", weight: 0.6 }],
				}),
			],
			direct: [],
			valued: [holding({ id: "WRLD", kind: "fund", value: 1000 })],
			valuedTotal: 1000,
		});
		expect(dims.sector.buckets).toEqual([
			{ key: "technology", value: 600, weight: 0.6 },
			{ key: "unknown", value: 400, weight: 0.4 },
		]);
	});

	it("groups listing currencies by each holding's own currency", () => {
		const dims = computeDimensions({
			etfInputs: [],
			direct: [
				direct({ ticker: "A", value: 70 }),
				direct({ ticker: "B", value: 30 }),
			],
			valued: [
				holding({ id: "A", value: 70, listingCurrency: "USD" }),
				holding({ id: "B", value: 30, listingCurrency: "EUR" }),
			],
			valuedTotal: 100,
		});
		expect(dims.listingCurrency.buckets).toEqual([
			{ key: "USD", value: 70, weight: 0.7 },
			{ key: "EUR", value: 30, weight: 0.3 },
		]);
	});

	it("reads economic currency from countries and hedging from the fund name", () => {
		const dims = computeDimensions({
			etfInputs: [
				etf({
					ticker: "HDGD",
					name: "Synthetic World UCITS ETF EUR Hedged (Acc)",
					value: 1000,
					countryVector: [{ key: "US", weight: 1 }],
				}),
			],
			direct: [],
			valued: [holding({ id: "HDGD", kind: "fund", value: 1000 })],
			valuedTotal: 1000,
		});
		expect(dims.economicCurrency.buckets[0]?.key).toBe("EUR");
		expect(dims.economicCurrency.nameInferredHedgeWeight).toBeCloseTo(1, 6);
	});
});
