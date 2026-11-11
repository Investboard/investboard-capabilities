import { describe, expect, it } from "vitest";
import {
	isNeverLookedThroughClass,
	mapReportedFundClass,
	NEVER_LOOKED_THROUGH_CLASSES,
	normalizeAssetClass,
	resolveFundClass,
	SPECIFIC_FUND_CLASSES,
} from "../../src/internal/xray/asset-class.js";
describe("normalizeAssetClass", () => {
	it("passes through the 8 IPS classes", () => {
		for (const c of [
			"equities",
			"bonds",
			"gold",
			"crypto",
			"cash",
			"alternatives",
			"real_estate",
			"commodities",
		]) {
			expect(normalizeAssetClass(c)).toBe(c);
		}
	});
	it("maps anything unknown to alternatives (M16 semantics)", () => {
		expect(normalizeAssetClass("etf")).toBe("alternatives");
		expect(normalizeAssetClass("")).toBe("alternatives");
	});
});
describe("mapReportedFundClass", () => {
	it("maps reported fund class labels to the 8-class taxonomy", () => {
		expect(mapReportedFundClass("Equity")).toBe("equities");
		expect(mapReportedFundClass("Fixed Income")).toBe("bonds");
		expect(mapReportedFundClass("Commodity")).toBe("commodities");
		expect(mapReportedFundClass("Real Estate")).toBe("equities");
		expect(mapReportedFundClass("Money Market")).toBe("cash");
		expect(mapReportedFundClass("Digital Assets")).toBe("crypto");
		expect(mapReportedFundClass("Alternative")).toBe("alternatives");
	});
	it("returns null for mixed/unknown classes, never guesses", () => {
		expect(mapReportedFundClass("Allocation")).toBeNull();
		expect(mapReportedFundClass(null)).toBeNull();
		expect(mapReportedFundClass(undefined)).toBeNull();
		expect(mapReportedFundClass("Something New")).toBeNull();
	});
	it("trims and is case-insensitive on free-form provider strings", () => {
		expect(mapReportedFundClass("EQUITY")).toBe("equities");
		expect(mapReportedFundClass("  Fixed Income  ")).toBe("bonds");
		expect(mapReportedFundClass("gold")).toBe("gold");
	});
});
describe("resolveFundClass", () => {
	it.each([
		["cash", "bonds", "cash"],
		["gold", "commodities", "gold"],
		["bonds", "equities", "bonds"],
		["crypto", "equities", "crypto"],
		["real_estate", "equities", "real_estate"],
		["commodities", "alternatives", "commodities"],
		["equities", "bonds", "bonds"],
		["alternatives", "real_estate", "real_estate"],
		["alternatives", null, "alternatives"],
		["equities", null, "equities"],
		["etf", null, null],
		["etf", "bonds", "bonds"],
	])("a %j row beside a %j provider label reads %j", (stored, provider, expected) => {
		expect(resolveFundClass(stored, provider)).toBe(expected);
	});
	it("names exactly the six classes the import never writes as a default", () => {
		expect([...SPECIFIC_FUND_CLASSES].sort()).toEqual([
			"bonds",
			"cash",
			"commodities",
			"crypto",
			"gold",
			"real_estate",
		]);
	});
});
describe("the two class sets are independent", () => {
	it("real estate and commodities are specific stored classes, never sealed", () => {
		for (const assetClass of ["real_estate", "commodities"]) {
			expect(SPECIFIC_FUND_CLASSES.has(assetClass)).toBe(true);
			expect(NEVER_LOOKED_THROUGH_CLASSES.has(assetClass)).toBe(false);
		}
		expect([...NEVER_LOOKED_THROUGH_CLASSES].sort()).toEqual([
			"bonds",
			"cash",
			"crypto",
			"gold",
		]);
	});
	it("each consumer reads only its own set: the resolver decides who wins, the seal decides what may dissolve", () => {
		expect(resolveFundClass("real_estate", "equities")).toBe("real_estate");
		expect(resolveFundClass("cash", "equities")).toBe("cash");
		expect(isNeverLookedThroughClass("real_estate")).toBe(false);
		expect(isNeverLookedThroughClass("equities")).toBe(false);
		expect(isNeverLookedThroughClass("cash")).toBe(true);
		expect(resolveFundClass("bonds", "equities")).toBe("bonds");
		expect(isNeverLookedThroughClass("bonds")).toBe(true);
	});
});
