import { describe, expect, it } from "vitest";
import {
	NEVER_LOOKED_THROUGH_CLASSES,
	XRAY_ASSET_CLASSES,
} from "../../src/internal/xray/asset-class.js";
import {
	classificationBuckets,
	regionBucketsFromCountry,
} from "../../src/internal/xray/classification-buckets.js";
import {
	canBeLookedThrough,
	dissolveEtfs,
	holdNeverLookedThroughFundsWhole,
	lookThroughDissolutionTally,
	lookThroughFundCount,
} from "../../src/internal/xray/dissolve.js";
import { mergeEtfInputsByFund } from "../../src/internal/xray/fund-identity.js";
import { detectOverlaps } from "../../src/internal/xray/overlap.js";
import type { EngineEtfInput } from "../../src/internal/xray/types.js";
const SEALED_CLASSES = [...NEVER_LOOKED_THROUGH_CLASSES].sort();
function fundWithLookthrough(assetClass: string | null): EngineEtfInput {
	return {
		ticker: "OVNT.DE",
		isin: "LUSYN5770930",
		name: "Synthetic EUR Overnight Rate Swap UCITS ETF",
		value: 44450,
		underlyingAssetClass: assetClass,
		asOf: "2026-09-19",
		constituents: [
			{
				identifier: "BTPS 2.95 09/26",
				isin: "ITSYN2914690",
				name: "Italy Buoni Poliennali Del Tesoro",
				weight: 0.3,
			},
			{
				identifier: "EU 2.5 12/29",
				isin: "EUSYN9097280",
				name: "European Union",
				weight: 0.25,
			},
			{
				identifier: "OAT 0.75 05/28",
				isin: "FRSYN6771230",
				name: "France (Government Of)",
				weight: 0.25,
			},
			{
				identifier: "OAT 4.75 04/35",
				isin: "FRSYN1296090",
				name: "France (Government Of)",
				weight: 0.2,
			},
		],
		sectorVector: [{ key: "financial_services", weight: 1 }],
		countryVector: [
			{ key: "FR", weight: 0.45 },
			{ key: "IT", weight: 0.3 },
			{ key: "BE", weight: 0.25 },
		],
		industryVector: [{ key: "Banks - Regional", weight: 1 }],
	};
}
const COLLATERAL_ISINS = [
	"ITSYN2914690",
	"EUSYN9097280",
	"FRSYN6771230",
	"FRSYN1296090",
];
describe("the engine never looks through a fund that cannot hold equities", () => {
	it.each(
		SEALED_CLASSES,
	)("a %s fund WITH constituents and vectors dissolves to nothing but its own residual", (assetClass) => {
		const fund = fundWithLookthrough(assetClass);
		const { exposures, dissolutions } = dissolveEtfs([fund]);
		const dissolved = exposures.filter((e) => !e.residual);
		expect(dissolved).toEqual([]);
		expect(exposures).toHaveLength(1);
		const residual = exposures[0];
		expect(residual?.residual).toBe(true);
		expect(residual?.value).toBeCloseTo(fund.value, 6);
		expect(residual?.assetClass).toBe(assetClass);
		expect(residual?.id).toBe("residual:OVNT.DE");
		expect(residual?.issuerScopeUncertain).toBeUndefined();
		expect(dissolutions).toHaveLength(1);
		expect(dissolutions[0]).toMatchObject({
			status: "none",
			coveredWeight: 0,
			degraded: false,
		});
		const printed = JSON.stringify({ exposures, dissolutions });
		for (const isin of COLLATERAL_ISINS) {
			expect(printed, `${isin} must not survive dissolution`).not.toContain(
				isin,
			);
		}
	});
	it.each(
		SEALED_CLASSES,
	)("a %s fund contributes nothing to the sector, country or region dimensions", (assetClass) => {
		const fund = fundWithLookthrough(assetClass);
		const [sealed] = mergeEtfInputsByFund([fund]);
		expect(sealed?.sectorVector).toBeNull();
		expect(sealed?.countryVector).toBeNull();
		expect(sealed?.industryVector).toBeNull();
		const country = classificationBuckets({
			etfs: [
				{ value: sealed?.value ?? 0, vector: sealed?.countryVector ?? null },
			],
			direct: [],
			totalValue: fund.value,
		});
		expect(country.buckets.map((b) => b.key)).toEqual(["unknown"]);
		expect(country.coverage).toBe(0);
		const sector = classificationBuckets({
			etfs: [
				{ value: sealed?.value ?? 0, vector: sealed?.sectorVector ?? null },
			],
			direct: [],
			totalValue: fund.value,
		});
		expect(sector.buckets.map((b) => b.key)).toEqual(["unknown"]);
		const region = regionBucketsFromCountry(country, fund.value);
		expect(region.buckets.map((b) => b.key)).toEqual(["unknown"]);
	});
	it("two sealed funds produce no overlap pair, however much collateral they share", () => {
		const bondFund: EngineEtfInput = {
			...fundWithLookthrough("bonds"),
			ticker: "CORP.DE",
			isin: "IESYN8310770",
			name: "Synthetic Euro Corporate Bond UCITS ETF",
			value: 20900,
		};
		const pairs = detectOverlaps(
			mergeEtfInputsByFund([fundWithLookthrough("cash"), bondFund]),
		);
		expect(pairs).toEqual([]);
	});
	it("strips the look-through but leaves the caller's outage fact alone", () => {
		const [held] = holdNeverLookedThroughFundsWhole([
			{ ...fundWithLookthrough("cash"), degraded: true },
		]);
		expect(held?.constituents).toEqual([]);
		expect(held?.countryVector).toBeNull();
		expect(held?.degraded).toBe(true);
		expect(
			dissolveEtfs([held as EngineEtfInput]).dissolutions[0],
		).toMatchObject({ status: "none", degraded: true });
	});
	it("is idempotent and passes an already-sealed fund through by reference", () => {
		const sealed: EngineEtfInput = {
			...fundWithLookthrough("gold"),
			constituents: [],
			sectorVector: null,
			countryVector: null,
			industryVector: null,
		};
		const [once] = holdNeverLookedThroughFundsWhole([sealed]);
		expect(once).toBe(sealed);
	});
});
describe("every class OUTSIDE the set is looked through exactly as before", () => {
	const lookedThrough = [
		...XRAY_ASSET_CLASSES.filter((c) => !NEVER_LOOKED_THROUGH_CLASSES.has(c)),
		null,
	];
	it.each(
		lookedThrough,
	)("a %s fund dissolves to its constituents", (assetClass) => {
		const fund = fundWithLookthrough(assetClass);
		const { exposures, dissolutions } = dissolveEtfs([fund]);
		const dissolved = exposures.filter((e) => !e.residual);
		expect(dissolved).toHaveLength(fund.constituents.length);
		expect(dissolutions[0]?.status).toBe("full");
		expect(dissolutions[0]?.coveredWeight).toBeCloseTo(1, 6);
		const [merged] = mergeEtfInputsByFund([fund]);
		expect(merged?.countryVector).not.toBeNull();
		expect(merged?.sectorVector).not.toBeNull();
	});
	it("names exactly the four classes the X-Ray never looks through", () => {
		expect(SEALED_CLASSES).toEqual(["bonds", "cash", "crypto", "gold"]);
	});
});
describe("a fund counter counts the funds that can be looked through", () => {
	function equityFund(ticker: string): EngineEtfInput {
		return {
			...fundWithLookthrough("equities"),
			ticker,
			isin: null,
			name: `${ticker} equity fund`,
			value: 10000,
		};
	}
	it.each(
		SEALED_CLASSES,
	)("a %s fund cannot be looked through", (assetClass) => {
		expect(canBeLookedThrough(fundWithLookthrough(assetClass))).toBe(false);
	});
	it.each([
		...XRAY_ASSET_CLASSES.filter((c) => !NEVER_LOOKED_THROUGH_CLASSES.has(c)),
		null,
	])("a %s fund can be looked through", (assetClass) => {
		expect(canBeLookedThrough(fundWithLookthrough(assetClass))).toBe(true);
	});
	it("counts the equity funds of a five-fund book, not its five funds", () => {
		const book = [
			equityFund("WRLD.DE"),
			fundWithLookthrough("cash"),
			{ ...fundWithLookthrough("bonds"), ticker: "CORP.DE", isin: null },
			{ ...fundWithLookthrough("gold"), ticker: "4GLD.DE", isin: null },
			{ ...fundWithLookthrough("crypto"), ticker: "COIN.DE", isin: null },
		];
		const funds = mergeEtfInputsByFund(book);
		expect(funds).toHaveLength(5);
		expect(lookThroughFundCount(funds)).toBe(1);
		const { dissolutions } = dissolveEtfs(funds);
		expect(dissolutions).toHaveLength(5);
		expect(dissolutions.filter((d) => d.status === "none")).toHaveLength(4);
		expect(lookThroughDissolutionTally(funds, dissolutions)).toEqual({
			full: 1,
			partial: 0,
			none: 0,
		});
	});
	it("still counts an equity fund whose fetch failed, under `none`", () => {
		const funds = mergeEtfInputsByFund([
			equityFund("WRLD.DE"),
			{
				...equityFund("CORE.DE"),
				constituents: [],
				sectorVector: null,
				countryVector: null,
				industryVector: null,
				degraded: true,
			},
			{ ...fundWithLookthrough("bonds"), ticker: "CORP.DE", isin: null },
		]);
		expect(lookThroughFundCount(funds)).toBe(2);
		const { dissolutions } = dissolveEtfs(funds);
		expect(lookThroughDissolutionTally(funds, dissolutions)).toEqual({
			full: 1,
			partial: 0,
			none: 1,
		});
	});
	it("a book of nothing but held-whole funds counts zero, and says so", () => {
		const funds = mergeEtfInputsByFund([
			fundWithLookthrough("cash"),
			{ ...fundWithLookthrough("bonds"), ticker: "CORP.DE", isin: null },
		]);
		expect(lookThroughFundCount(funds)).toBe(0);
		const { dissolutions } = dissolveEtfs(funds);
		expect(dissolutions).toHaveLength(2);
		expect(lookThroughDissolutionTally(funds, dissolutions)).toEqual({
			full: 0,
			partial: 0,
			none: 0,
		});
	});
	it("joins by index and attributes nothing when the arrays do not line up", () => {
		const funds = mergeEtfInputsByFund([
			fundWithLookthrough("bonds"),
			{ ...equityFund("WRLD.DE"), ticker: "WRLD.DE" },
		]);
		const { dissolutions } = dissolveEtfs(funds);
		expect(lookThroughDissolutionTally(funds, dissolutions)).toEqual({
			full: 1,
			partial: 0,
			none: 0,
		});
		expect(
			lookThroughDissolutionTally(funds, dissolutions.slice(0, 1)),
		).toEqual({ full: 0, partial: 0, none: 0 });
	});
});
