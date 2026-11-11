import { describe, expect, it } from "vitest";
import { hasStressModelCoverage } from "../coverage.js";
import { computePortfolioImpact } from "../impact-calculator.js";
import { BUILT_IN_SCENARIOS } from "../scenarios/crisis-definitions.js";
import type { StressHoldingInput } from "../types.js";

const crisis = BUILT_IN_SCENARIOS.find((s) => s.key === "gfc_2008")!;
const share: StressHoldingInput = {
	holdingId: "one",
	isin: "XX0000000001",
	ticker: "SYNTHETIC",
	name: "Same economic fund",
	sector: "Other",
	assetClass: "equities",
	instrumentType: "etf",
	currentValue: 100,
};
describe("economic exposure is independent of quote convention", () => {
	it.each([
		null,
		undefined,
	])("does not infer cash from a missing %s instrument verdict", (instrumentType) => {
		const impacts = computePortfolioImpact(
			["EUR", "USD"].map((currency) => ({
				...share,
				holdingId: currency,
				assetClass: "cash",
				isin: null,
				instrumentType,
				currency,
			})),
			crisis,
		).holdingImpacts;
		expect(impacts.map((h) => h.postStressValue)).toEqual([100, 100]);
		expect(
			impacts.every(
				(h) => h.fxShockApplied === null && h.currencyMethod === "unknown",
			),
		).toBe(true);
	});
	it.each([
		"EUR",
		"USD",
	] as const)("parallel quotes have the same partial %s illustration and no invented FX split", (base) => {
		const result = computePortfolioImpact(
			["EUR", "USD", "JPY", null].map((currency, i) => ({
				...share,
				holdingId: String(i),
				currency,
			})),
			crisis,
			base,
		);
		expect(result.holdingImpacts.map((h) => h.postStressValue)).toEqual([
			43, 43, 43, 43,
		]);
		for (const h of result.holdingImpacts)
			expect(h).toMatchObject({
				fxShockApplied: null,
				currencyMethod: "unknown",
			});
	});
	it("uses verified economic exposure, never parallel listing denomination", () => {
		const economicCurrency = {
			currency: "USD",
			hedge: "unhedged" as const,
			source: "synthetic verified exposure",
		};
		for (const currency of ["EUR", "USD"])
			expect(
				computePortfolioImpact(
					[{ ...share, currency, economicCurrency }],
					crisis,
				).holdingImpacts[0],
			).toMatchObject({
				// -0.57 equity move compounded with the +0.12 USD move: 100 x 0.43 x 1.12.
				postStressValue: 48.16,
				fxShockApplied: 0.12,
				currencyMethod: "economic_exposure",
			});
	});
	it("uses a verified full hedge target and preserves unknown hedge policy", () => {
		const economicCurrency = {
			currency: "EUR",
			hedge: "hedged" as const,
			source: "synthetic full EUR hedge",
		};
		expect(
			computePortfolioImpact(
				[{ ...share, currency: "USD", economicCurrency }],
				crisis,
			).holdingImpacts[0],
		).toMatchObject({
			postStressValue: 43,
			fxShockApplied: 0,
			currencyMethod: "hedged",
		});
		expect(
			computePortfolioImpact([{ ...share, currency: "EUR" }], crisis)
				.holdingImpacts[0]?.fxShockApplied,
		).toBeNull();
	});
	it("refuses known but unmodeled economic exposure and recognizes cash denomination", () => {
		expect(
			hasStressModelCoverage(
				[
					{
						...share,
						economicCurrency: {
							currency: "ZZZ",
							hedge: "unhedged",
							source: "synthetic",
						},
					},
				],
				crisis,
				"EUR",
			),
		).toBe(false);
		expect(
			computePortfolioImpact(
				[
					{
						...share,
						isin: null,
						instrumentType: "cash",
						assetClass: "cash",
						currency: "USD",
					},
				],
				crisis,
			).holdingImpacts[0],
		).toMatchObject({
			fxShockApplied: 0.12,
			currencyMethod: "economic_exposure",
		});
	});
	it.each([
		"cash",
		"bonds",
		"gold",
		"equities",
	])("keeps %s fund quote currency separate from economic exposure", (assetClass) => {
		const impacts = computePortfolioImpact(
			["EUR", "USD"].map((currency) => ({
				...share,
				holdingId: currency,
				currency,
				assetClass,
			})),
			crisis,
		).holdingImpacts;
		expect(impacts[0]?.postStressValue).toBe(impacts[1]?.postStressValue);
		expect(
			impacts.every(
				(h) => h.fxShockApplied === null && h.currencyMethod === "unknown",
			),
		).toBe(true);
	});
	it("recognizes declared manual cash without treating a security's other verdict as cash", () => {
		const cash = {
			...share,
			isin: null,
			assetClass: "cash",
			instrumentType: "other",
			priceSource: "manual",
			currency: "USD",
		};
		// gfc_2008 with a EUR base: USD rose against the euro (ECB 1.4037 on
		// 2007-10-09, 1.2565 on 2009-03-09, a move of +0.12), so EUR 100 of
		// USD cash ends at EUR 112.00, not EUR 92.00.
		expect(
			computePortfolioImpact([cash], crisis).holdingImpacts[0],
		).toMatchObject({
			postStressValue: 112,
			fxShockApplied: 0.12,
			currencyMethod: "economic_exposure",
		});
		for (const security of [
			{ ...cash, priceSource: "fmp" },
			{ ...cash, isin: share.isin },
			{ ...cash, instrumentType: "fund_etf" },
		])
			expect(
				computePortfolioImpact([security], crisis).holdingImpacts[0],
			).toMatchObject({
				postStressValue: 100,
				fxShockApplied: null,
				currencyMethod: "unknown",
			});
		expect(
			hasStressModelCoverage([{ ...cash, currency: "ZZZ" }], crisis, "EUR"),
		).toBe(false);
	});
});
