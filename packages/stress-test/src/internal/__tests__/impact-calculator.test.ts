import { describe, expect, it } from "vitest";
import { computePortfolioImpact } from "../impact-calculator.js";
import { BUILT_IN_SCENARIOS } from "../scenarios/crisis-definitions.js";
import type { StressHoldingInput } from "../types.js";
import { createStressHolding } from "./fixtures.js";

const GFC_2008 = BUILT_IN_SCENARIOS.find((s) => s.key === "gfc_2008")!;

describe("computePortfolioImpact", () => {
	it("computes per-holding impacts and portfolio totals for a mixed portfolio against GFC_2008", () => {
		const holdings: StressHoldingInput[] = [
			createStressHolding({
				holdingId: "h-tech",
				ticker: "AAPL",
				name: "Apple Inc.",
				sector: "Technology",
				assetClass: "equities",
				currentValue: 20000,
			}),
			createStressHolding({
				holdingId: "h-health",
				ticker: "JNJ",
				name: "Johnson & Johnson",
				sector: "Healthcare",
				assetClass: "equities",
				currentValue: 15000,
			}),
			createStressHolding({
				holdingId: "h-fin",
				ticker: "JPM",
				name: "JPMorgan Chase",
				sector: "Financials",
				assetClass: "equities",
				currentValue: 10000,
			}),
			createStressHolding({
				holdingId: "h-gold",
				ticker: "XAUUSD",
				name: "Gold",
				sector: null,
				assetClass: "gold",
				currentValue: 5000,
			}),
		];

		const result = computePortfolioImpact(holdings, GFC_2008);
		expect(result.holdingImpacts).toHaveLength(4);
		const tech = result.holdingImpacts.find((h) => h.holdingId === "h-tech")!;
		expect(tech.preStressValue).toBe(20000);
		expect(tech.postStressValue).toBe(10000);
		expect(tech.absoluteLoss).toBe(-10000);
		expect(tech.betaAdjusted).toBe(false);
		const health = result.holdingImpacts.find(
			(h) => h.holdingId === "h-health",
		)!;
		expect(health.preStressValue).toBe(15000);
		expect(health.postStressValue).toBe(9300);
		expect(health.absoluteLoss).toBe(-5700);
		expect(health.betaAdjusted).toBe(false);
		const fin = result.holdingImpacts.find((h) => h.holdingId === "h-fin")!;
		expect(fin.preStressValue).toBe(10000);
		expect(fin.postStressValue).toBe(1700);
		expect(fin.absoluteLoss).toBe(-8300);
		expect(fin.betaAdjusted).toBe(false);
		const gold = result.holdingImpacts.find((h) => h.holdingId === "h-gold")!;
		expect(gold.preStressValue).toBe(5000);
		expect(gold.postStressValue).toBe(6250);
		expect(gold.absoluteLoss).toBe(1250);
		expect(result.preStressTotal).toBe(50000);
		expect(result.postStressTotal).toBe(27250);
		expect(result.absoluteLoss).toBe(-22750);
		expect(result.percentageLoss).toBe(-0.455);
	});

	it("handles a single holding portfolio", () => {
		const holdings: StressHoldingInput[] = [
			createStressHolding({
				holdingId: "h-solo",
				ticker: "MSFT",
				name: "Microsoft",
				sector: "Technology",
				assetClass: "equities",
				currentValue: 10000,
			}),
		];

		const result = computePortfolioImpact(holdings, GFC_2008);

		expect(result.holdingImpacts).toHaveLength(1);
		expect(result.preStressTotal).toBe(10000);
		expect(result.postStressTotal).toBe(5000);
		expect(result.absoluteLoss).toBe(-5000);
		expect(result.percentageLoss).toBe(-0.5);
	});

	it("returns zeros for an empty portfolio", () => {
		const result = computePortfolioImpact([], GFC_2008);

		expect(result.holdingImpacts).toEqual([]);
		expect(result.preStressTotal).toBe(0);
		expect(result.postStressTotal).toBe(0);
		expect(result.absoluteLoss).toBe(0);
		expect(result.percentageLoss).toBe(0);
	});

	it("uses asset class defaults for an all-bonds portfolio", () => {
		const holdings: StressHoldingInput[] = [
			createStressHolding({
				holdingId: "h-bond1",
				ticker: "AGGH.DE",
				name: "Global Bonds",
				sector: null,
				assetClass: "bonds",
				currentValue: 30000,
			}),
			createStressHolding({
				holdingId: "h-bond2",
				ticker: "EUNA.DE",
				name: "Euro Bonds",
				sector: null,
				assetClass: "bonds",
				currentValue: 20000,
			}),
		];

		const result = computePortfolioImpact(holdings, GFC_2008);

		expect(result.holdingImpacts).toHaveLength(2);
		for (const impact of result.holdingImpacts) {
			expect(impact.shockSource).toBe("asset_class_default");
			expect(impact.shockApplied).toBe(-0.05);
		}
		expect(result.preStressTotal).toBe(50000);
		expect(result.postStressTotal).toBe(47500);
		expect(result.absoluteLoss).toBe(-2500);
		expect(result.percentageLoss).toBe(-0.05);
	});

	it("resolves sector correctly (Financial Services -> Financials) in HoldingImpact output", () => {
		const holdings: StressHoldingInput[] = [
			createStressHolding({
				holdingId: "h-fs",
				ticker: "AXA.PA",
				name: "AXA SA",
				sector: "Financial Services", // FMP variant
				assetClass: "equities",
				currentValue: 10000,
			}),
		];

		const result = computePortfolioImpact(holdings, GFC_2008);

		expect(result.holdingImpacts).toHaveLength(1);
		expect(result.holdingImpacts[0]!.sector).toBe("Financials");
	});
});
