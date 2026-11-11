import { describe, expect, it } from "vitest";
import {
	applyConstituentVectors,
	type ConstituentClassification,
	composeConstituentVectors,
} from "../../src/internal/xray/constituent-classification.js";
import { normalizeCountry } from "../../src/internal/xray/country.js";
import { normalizeSector } from "../../src/internal/xray/sector.js";
import type { EngineEtfInput } from "../../src/internal/xray/types.js";
function classifierFrom(
	rows: Record<string, ConstituentClassification>,
): (isin: string) => ConstituentClassification | undefined {
	return (isin) => rows[isin];
}
describe("composeConstituentVectors", () => {
	it("accumulates constituent weight per normalized country and sector", () => {
		const rows: Record<string, ConstituentClassification> = {
			TWSYN3501200: { country: "TW", sector: "Technology", industry: null },
			KRSYN0449960: { country: "KR", sector: "Technology", industry: null },
			INSYN7460560: {
				country: "IN",
				sector: "Financial Services",
				industry: null,
			},
		};
		const { countryVector, sectorVector } = composeConstituentVectors(
			[
				{ isin: "TWSYN3501200", weight: 0.5 },
				{ isin: "KRSYN0449960", weight: 0.3 },
				{ isin: "INSYN7460560", weight: 0.2 },
			],
			classifierFrom(rows),
		);
		const country = new Map(countryVector?.map((e) => [e.key, e.weight]));
		expect(country.get(normalizeCountry("TW") as string)).toBeCloseTo(0.5, 10);
		expect(country.get(normalizeCountry("KR") as string)).toBeCloseTo(0.3, 10);
		expect(country.get(normalizeCountry("IN") as string)).toBeCloseTo(0.2, 10);
		const sector = new Map(sectorVector?.map((e) => [e.key, e.weight]));
		const techKey = normalizeSector("Technology") as string;
		expect(techKey).not.toBeNull();
		expect(sector.get(techKey)).toBeCloseTo(0.8, 10);
	});
	it("excludes constituents with no isin, no master row, or a null field", () => {
		const rows: Record<string, ConstituentClassification> = {
			US1111111005: { country: "US", sector: "Technology", industry: null },
			XX0000000001: { country: null, sector: "Energy", industry: null },
		};
		const { countryVector, sectorVector } = composeConstituentVectors(
			[
				{ isin: "US1111111005", weight: 0.4 },
				{ isin: "XX0000000001", weight: 0.3 },
				{ isin: null, weight: 0.2 },
				{ isin: "NOTINMASTER99", weight: 0.1 },
			],
			classifierFrom(rows),
		);
		const country = new Map(countryVector?.map((e) => [e.key, e.weight]));
		expect(country.size).toBe(1);
		expect(country.get("US")).toBeCloseTo(0.4, 10);
		const sector = new Map(sectorVector?.map((e) => [e.key, e.weight]));
		expect(sector.get(normalizeSector("Technology") as string)).toBeCloseTo(
			0.4,
			10,
		);
		expect(sector.get(normalizeSector("Energy") as string)).toBeCloseTo(
			0.3,
			10,
		);
	});
	it("returns null for a dimension when nothing resolves", () => {
		const { countryVector, sectorVector } = composeConstituentVectors(
			[
				{ isin: null, weight: 0.5 },
				{ isin: "NOTINMASTER99", weight: 0.5 },
			],
			classifierFrom({}),
		);
		expect(countryVector).toBeNull();
		expect(sectorVector).toBeNull();
	});
	it("drops an off-vocabulary sector label rather than fabricating a key", () => {
		const rows: Record<string, ConstituentClassification> = {
			US1111111005: {
				country: "US",
				sector: "Totally Not A Sector",
				industry: null,
			},
		};
		const { countryVector, sectorVector } = composeConstituentVectors(
			[{ isin: "US1111111005", weight: 1 }],
			classifierFrom(rows),
		);
		expect(countryVector?.[0]?.key).toBe("US");
		expect(sectorVector).toBeNull();
	});
	it("composes an industry vector from RAW industry text, refuse-to-fab", () => {
		const rows: Record<string, ConstituentClassification> = {
			US1111111005: {
				country: "US",
				sector: "Technology",
				industry: "Semiconductors",
			},
			DESYN9570820: {
				country: "DE",
				sector: "Technology",
				industry: null,
			},
		};
		const { industryVector } = composeConstituentVectors(
			[
				{ isin: "US1111111005", weight: 0.5 },
				{ isin: "DESYN9570820", weight: 0.3 },
				{ isin: "NOTINMASTER99", weight: 0.2 },
			],
			classifierFrom(rows),
		);
		expect(industryVector).toEqual([{ key: "Semiconductors", weight: 0.5 }]);
	});
	it("returns a null industry vector when nothing carries an industry", () => {
		const rows: Record<string, ConstituentClassification> = {
			US1111111005: { country: "US", sector: "Technology", industry: null },
		};
		const { industryVector } = composeConstituentVectors(
			[{ isin: "US1111111005", weight: 1 }],
			classifierFrom(rows),
		);
		expect(industryVector).toBeNull();
	});
	it("sorts each vector by descending weight", () => {
		const rows: Record<string, ConstituentClassification> = {
			A0000000001: { country: "US", sector: "Technology", industry: null },
			B0000000002: { country: "DE", sector: "Industrials", industry: null },
			C0000000003: { country: "JP", sector: "Technology", industry: null },
		};
		const { countryVector } = composeConstituentVectors(
			[
				{ isin: "B0000000002", weight: 0.2 },
				{ isin: "A0000000001", weight: 0.5 },
				{ isin: "C0000000003", weight: 0.3 },
			],
			classifierFrom(rows),
		);
		expect(countryVector?.map((e) => e.key)).toEqual(["US", "JP", "DE"]);
	});
});
describe("applyConstituentVectors", () => {
	const rows: Record<string, ConstituentClassification> = {
		US1111111005: { country: "US", sector: "Technology", industry: null },
	};
	const constituents = [
		{ identifier: "ALDR", isin: "US1111111005", name: "ALDR", weight: 1 },
	];
	function etf(over: Partial<EngineEtfInput>): EngineEtfInput {
		return {
			ticker: "T",
			isin: null,
			name: "n",
			value: 1000,
			underlyingAssetClass: "equities",
			constituents: [],
			sectorVector: null,
			countryVector: [{ key: "JP", weight: 1 }],
			asOf: null,
			...over,
		};
	}
	it("re-bases a NULL-underlying fund: an unmapped class is the equity axis", () => {
		const [out] = applyConstituentVectors(
			[etf({ underlyingAssetClass: null, constituents })],
			classifierFrom(rows),
		);
		expect(out?.countryVector).toEqual([{ key: "US", weight: 1 }]);
	});
	it("leaves a confidently off-axis (bond) sleeve on its own vectors", () => {
		const bond = etf({ underlyingAssetClass: "bonds", constituents });
		const [out] = applyConstituentVectors([bond], classifierFrom(rows));
		expect(out).toBe(bond);
	});
});
