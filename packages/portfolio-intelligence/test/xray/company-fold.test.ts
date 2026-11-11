import { describe, expect, it } from "vitest";
import { foldCompanyParts } from "../../src/internal/xray/company-fold.js";
import { dissolveEtfs } from "../../src/internal/xray/dissolve.js";
import { groupByIssuer } from "../../src/internal/xray/group-by-issuer.js";
import {
	classPartId,
	isResidualId,
	singleTitleCount,
} from "../../src/internal/xray/identity.js";
import { mergeByIdentity } from "../../src/internal/xray/merge.js";
import { topTenBookConcentration } from "../../src/internal/xray/top-ten.js";
import type {
	EngineDirectHolding,
	EngineEtfInput,
} from "../../src/internal/xray/types.js";
const LARCHHAUS = "DESYN1494950";
const ALDER = "US1111111005";
const fund = (
	ticker: string,
	isin: string,
	underlyingAssetClass: string,
	value: number,
	constituents: Array<{
		isin: string;
		name: string;
		weight: number;
	}>,
): EngineEtfInput => ({
	ticker,
	isin,
	name: ticker,
	value,
	underlyingAssetClass,
	constituents: constituents.map((c) => ({ identifier: c.name, ...c })),
	sectorVector: null,
	countryVector: null,
	asOf: null,
});
const WORLD = fund("WRLD.DE", "IESYN6451620", "equities", 60000, [
	{ isin: LARCHHAUS, name: "LARCHHAUS SE", weight: 0.1 },
	{ isin: "US4444441045", name: "MICROSOFT CORP", weight: 0.05 },
]);
const PROPERTY = fund("IPRP.AS", "IESYN7134510", "real_estate", 16000, [
	{ isin: LARCHHAUS, name: "LARCHHAUS SE", weight: 0.5 },
]);
const DIRECT: EngineDirectHolding[] = [
	{
		ticker: "ALDR",
		isin: ALDER,
		name: "Alder Inc.",
		value: 10000,
		assetClass: "equities",
	},
];
const TOTAL = 86000;
function book() {
	return mergeByIdentity(
		DIRECT,
		dissolveEtfs([WORLD, PROPERTY]).exposures,
		TOTAL,
	);
}
describe("company figures read companies, not class parts", () => {
	it("the merge keeps Larchhaus as two class parts", () => {
		const merged = book();
		const parts = merged.filter((p) => p.isin === LARCHHAUS);
		expect(parts.map((p) => [p.id, p.assetClass, p.value]).sort()).toEqual(
			[
				[`isin:${LARCHHAUS}`, "equities", 6000],
				[classPartId(`isin:${LARCHHAUS}`, "real_estate"), "real_estate", 8000],
			].sort(),
		);
	});
	it("folds the parts into one company row with the whole company's figures", () => {
		const companies = foldCompanyParts(book());
		const larchhaus = companies.filter((p) => p.isin === LARCHHAUS);
		expect(larchhaus).toHaveLength(1);
		const [row] = larchhaus;
		expect(row?.id).toBe(`isin:${LARCHHAUS}`);
		expect(row?.assetClass).toBe("equities");
		expect(row?.value).toBe(14000);
		expect(row?.weight).toBeCloseTo(14000 / TOTAL, 4);
		expect(row?.provenance.viaFunds.map((f) => f.etf).sort()).toEqual([
			"IPRP.AS",
			"WRLD.DE",
		]);
		expect(companies.find((p) => !isResidualId(p.id))?.isin).toBe(LARCHHAUS);
	});
	it("returns every row of a book with no split company unchanged", () => {
		const merged = mergeByIdentity(
			DIRECT,
			dissolveEtfs([WORLD]).exposures,
			70000,
		);
		const folded = foldCompanyParts(merged);
		expect(folded).toHaveLength(merged.length);
		for (const p of merged) expect(folded).toContain(p);
	});
	it("never reports one security held through two classes as two share classes", () => {
		const groups = groupByIssuer(book());
		const larchhaus = groups.find((g) =>
			g.breakdown.some((p) => p.isin === LARCHHAUS),
		);
		expect(larchhaus?.grouped).toBe(false);
		expect(larchhaus?.breakdown).toHaveLength(1);
		expect(larchhaus?.value).toBe(14000);
	});
	it("keeps the investor's own label on every part of a company they hold directly", () => {
		const merged = mergeByIdentity(
			[
				{
					ticker: "LRH",
					isin: LARCHHAUS,
					name: "Larchhaus SE",
					value: 2000,
					assetClass: "unknown",
				},
			],
			dissolveEtfs([WORLD]).exposures,
			62000,
		);
		const parts = merged.filter((p) => p.isin === LARCHHAUS);
		expect(parts).toHaveLength(2);
		expect(parts.map((p) => p.name)).toEqual(["Larchhaus SE", "Larchhaus SE"]);
		const [company] = foldCompanyParts(parts);
		expect(company?.provenance.direct).toBeGreaterThan(0);
		expect(company?.provenance.viaFunds).toHaveLength(1);
	});
});
