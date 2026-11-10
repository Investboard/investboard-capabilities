import { stressAttributionSchema } from "../../../test/contracts.js";
import type { HoldingImpact } from "../result-types.js";
import { describe, expect, it } from "vitest";
import { summarizeStressImpacts } from "../attribution.js";
import { isStressScenarioCovered } from "../coverage.js";
import { computePortfolioImpact } from "../impact-calculator.js";
import { BUILT_IN_SCENARIOS } from "../scenarios/crisis-definitions.js";

const impact = (
	holdingId: string,
	before: number,
	after: number,
	history = false,
): HoldingImpact => ({
	holdingId,
	name: holdingId,
	ticker: holdingId,
	preStressValue: before,
	postStressValue: after,
	absoluteLoss: after - before,
	percentageLoss: (after - before) / before,
	sector: "technology",
	assetClass: "equities",
	shockApplied: -0.5,
	shockSource: history ? "historical_price" : "asset_class_default",
	betaAdjusted: false,
});

describe("scenario attribution", () => {
	it("ranks the same security across accounts together, without merging names or evidence methods", () => {
		const apple = "US0378331005";
		const summary = summarizeStressImpacts([
			{ ...impact("z", 1000, 900), name: "Apple", isin: apple },
			{ ...impact("a", 1000, 850), name: "Apple", isin: apple },
			impact("other", 1000, 800),
			{ ...impact("same-name", 100, 80), name: "Apple", isin: "US5949181045" },
			{ ...impact("history", 100, 95, true), name: "Apple", isin: apple },
		]);
		expect(
			summary?.lossDrivers.map((row) => [
				row.holdingId,
				row.impactCents,
				row.holdingCount,
			]),
		).toEqual([
			["a", -25000, 2],
			["other", -20000, undefined],
			["same-name", -2000, undefined],
		]);
		expect(summary?.netImpactCents).toBe(-47500);
		expect(summary?.otherImpactCents).toBe(-500);
		expect(summary?.historicalValueFraction).toBeCloseTo(100 / 3200);
		expect(stressAttributionSchema.parse(summary)).toEqual(summary);
	});
	it("nets offsets before selecting a security's losses and rounds its combined cents once", () => {
		const isin = "US0378331005";
		const offset = summarizeStressImpacts([
			{ ...impact("a", 1000, 900), isin },
			{ ...impact("b", 1000, 1200), isin },
			impact("loss", 100, 50),
		]);
		expect(offset?.lossDrivers.map((row) => row.holdingId)).toEqual(["loss"]);
		expect(offset?.netImpactCents).toBe(5000);
		expect(offset?.otherImpactCents).toBe(10000);
		const small = summarizeStressImpacts([
			{ ...impact("a", 10, 9.996), isin },
			{ ...impact("b", 10, 9.996), isin },
		]);
		expect(small?.lossDrivers[0]?.impactCents).toBe(-1);
		expect(small?.otherImpactCents).toBe(0);
	});
	it("retains security identity through the real calculator without changing individual shocks", () => {
		const inputs = ["a", "b"].map((holdingId) => ({
			holdingId,
			isin: "US0378331005",
			name: "Apple",
			ticker: "AAPL",
			assetClass: "equities",
			sector: "technology",
			currency: "USD",
			currentValue: 100,
		}));
		const result = computePortfolioImpact(
			inputs,
			BUILT_IN_SCENARIOS[0]!,
			"EUR",
		);
		expect(result.holdingImpacts.map((row) => row.isin)).toEqual([
			inputs[0]?.isin,
			inputs[1]?.isin,
		]);
		const summary = summarizeStressImpacts(result.holdingImpacts);
		expect(summary?.lossDrivers).toHaveLength(1);
		expect(summary?.lossDrivers[0]?.holdingCount).toBe(2);
		expect(summary?.lossDrivers[0]?.impactCents).toBe(summary?.netImpactCents);
	});
	it("does not infer a shared security from the same display name or ticker", () => {
		const summary = summarizeStressImpacts([
			{ ...impact("a", 100, 80), name: "Same", ticker: "SAME" },
			{
				...impact("b", 100, 70),
				name: "Same",
				ticker: "SAME",
				isin: "unknown",
			},
		]);
		expect(summary?.lossDrivers.map((row) => row.holdingId)).toEqual([
			"b",
			"a",
		]);
	});
	it("ranks money lost, not return percentages, and reconciles offsets in cents", () => {
		const summary = summarizeStressImpacts([
			impact("large", 1000, 900, true),
			impact("small", 100, 50),
			impact("third", 100, 60),
			impact("fourth", 100, 80),
			impact("hedge", 100, 150),
		]);
		expect(summary?.lossDrivers.map((row) => row.holdingId)).toEqual([
			"large",
			"small",
			"third",
		]);
		expect(summary?.netImpactCents).toBe(-16000);
		expect(summary?.otherImpactCents).toBe(3000);
		expect(summary?.historicalValueFraction).toBeCloseTo(1000 / 1400);
		expect(summary?.lossDrivers[0]?.portfolioImpactFraction).toBeCloseTo(
			-100 / 1400,
		);
		expect(stressAttributionSchema.parse(summary)).toEqual(summary);
	});
	it("keeps cent rounding in the reconciliation and refuses missing/non-finite values", () => {
		const summary = summarizeStressImpacts([
			impact("a", 10.004, 9.996),
			impact("b", 10.004, 10.003),
		]);
		expect(
			summary?.lossDrivers.reduce(
				(sum, row) => sum + row.impactCents,
				summary.otherImpactCents,
			),
		).toBe(summary?.netImpactCents);
		expect(summarizeStressImpacts([])).toBeNull();
		expect(summarizeStressImpacts([impact("a", Number.NaN, 10)])).toBeNull();
		expect(summarizeStressImpacts([impact("a", 0, 0)])).toBeNull();
	});
	it("rejects missing/duplicate impacts even when remaining rows have measured histories", () => {
		const crisis = BUILT_IN_SCENARIOS[0]!;
		const holdings = ["a", "b"].map((holdingId) => ({
			holdingId,
			name: holdingId,
			ticker: holdingId,
			sector: null,
			assetClass: "equities",
			currency: "EUR",
			currentValue: 100,
		}));
		const result = computePortfolioImpact(holdings, crisis, "EUR");
		expect(
			isStressScenarioCovered(holdings, result.holdingImpacts, crisis, "EUR"),
		).toBe(true);
		expect(
			isStressScenarioCovered(
				holdings,
				[impact("a", 100, 50, true)],
				crisis,
				"EUR",
			),
		).toBe(false);
		expect(
			isStressScenarioCovered(
				holdings,
				[impact("a", 100, 50, true), impact("a", 100, 50, true)],
				crisis,
				"EUR",
			),
		).toBe(false);
	});
});
