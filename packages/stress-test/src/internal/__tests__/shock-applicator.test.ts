import { describe, expect, it } from "vitest";
import { BUILT_IN_SCENARIOS } from "../scenarios/crisis-definitions.js";
import type { ShockResult } from "../shock-applicator.js";
import { applyShock } from "../shock-applicator.js";
import { createStressHolding } from "./fixtures.js";

const GFC_2008 = BUILT_IN_SCENARIOS.find((s) => s.key === "gfc_2008")!;
const RATE_HIKE_2022 = BUILT_IN_SCENARIOS.find(
	(s) => s.key === "rate_hike_2022",
)!;

describe("applyShock", () => {
	it("applies raw sector shock to equity holding", () => {
		const holding = createStressHolding({
			sector: "Technology",
			assetClass: "equities",
			currentValue: 10000,
		});
		const result: ShockResult = applyShock(holding, GFC_2008);
		expect(result.shockApplied).toBeCloseTo(-0.5, 4);
		expect(result.postStressValue).toBeCloseTo(5000, 2);
		expect(result.shockSource).toBe("sector_proxy");
		expect(result.betaAdjusted).toBe(false);
	});

	it("applies asset-class default shock to bond holding", () => {
		const holding = createStressHolding({
			sector: null,
			assetClass: "bonds",
			currentValue: 10000,
		});
		const result = applyShock(holding, GFC_2008);
		expect(result.shockApplied).toBeCloseTo(-0.05, 4);
		expect(result.postStressValue).toBeCloseTo(9500, 2);
		expect(result.shockSource).toBe("asset_class_default");
		expect(result.betaAdjusted).toBe(false);
	});

	it("applies positive gold shock correctly (gold goes UP in crises)", () => {
		const holding = createStressHolding({
			sector: null,
			assetClass: "gold",
			currentValue: 10000,
		});
		const result = applyShock(holding, GFC_2008);
		expect(result.shockApplied).toBeCloseTo(0.25, 4);
		expect(result.postStressValue).toBeCloseTo(12500, 2);
		expect(result.absoluteLoss).toBeCloseTo(2500, 2); // gain, not loss
		expect(result.shockSource).toBe("asset_class_default");
		expect(result.betaAdjusted).toBe(false);
	});

	it("applies crypto asset-class shock in RATE_HIKE_2022", () => {
		const holding = createStressHolding({
			sector: null,
			assetClass: "crypto",
			currentValue: 10000,
		});
		const result = applyShock(holding, RATE_HIKE_2022);
		expect(result.shockApplied).toBeCloseTo(-0.65, 4);
		expect(result.postStressValue).toBeCloseTo(3500, 2);
		expect(result.shockSource).toBe("asset_class_default");
	});

	it("falls back to sector proxy for equity holding with null sector", () => {
		const holding = createStressHolding({
			sector: null,
			assetClass: "equities",
			currentValue: 10000,
		});
		const result = applyShock(holding, GFC_2008);
		expect(result.shockApplied).toBeCloseTo(-0.57, 4);
		expect(result.postStressValue).toBeCloseTo(4300, 0);
		expect(result.shockSource).toBe("sector_proxy");
		expect(result.betaAdjusted).toBe(false);
	});

	it("returns zero loss for holding with currentValue = 0", () => {
		const holding = createStressHolding({
			sector: "Technology",
			assetClass: "equities",
			currentValue: 0,
		});
		const result = applyShock(holding, GFC_2008);

		expect(result.postStressValue).toBe(0);
		expect(result.absoluteLoss).toBe(0);
		expect(result.percentageLoss).toBe(0);
	});

	it("returns zero shock for cash holding (cash is neutral)", () => {
		const holding = createStressHolding({
			sector: null,
			assetClass: "cash",
			currentValue: 10000,
		});
		const result = applyShock(holding, GFC_2008);
		expect(result.shockApplied).toBe(0);
		expect(result.postStressValue).toBe(10000);
		expect(result.absoluteLoss).toBe(0);
		expect(result.shockSource).toBe("asset_class_default");
	});
	it.each([
		"real_estate",
		"commodities",
	])("shocks a %s holding at the scenario's alternatives figure in every built-in scenario", (assetClass) => {
		for (const crisis of BUILT_IN_SCENARIOS) {
			const booked = applyShock(
				createStressHolding({ sector: null, assetClass, currentValue: 10000 }),
				crisis,
			);
			const folded = applyShock(
				createStressHolding({
					sector: null,
					assetClass: "alternatives",
					currentValue: 10000,
				}),
				crisis,
			);
			expect(booked.shockApplied, crisis.key).toBe(folded.shockApplied);
			expect(booked.shockSource).toBe("asset_class_default");
		}
	});

	it("reads a scenario's own real-estate figure before the proxy", () => {
		const custom = {
			...GFC_2008,
			assetClassShocks: { ...GFC_2008.assetClassShocks, real_estate: -0.4 },
		};
		const result = applyShock(
			createStressHolding({
				sector: null,
				assetClass: "real_estate",
				currentValue: 10000,
				currency: "EUR",
			}),
			custom,
		);
		expect(result.shockApplied).toBeCloseTo(-0.4, 6);
	});
	it.each([
		{ key: "gfc_2008", expectedShock: -0.57 },
		{ key: "covid_2020", expectedShock: -0.34 },
		{ key: "rate_hike_2022", expectedShock: -0.25 },
		{ key: "euro_crisis_2011", expectedShock: -0.22 },
		{ key: "dotcom_2000", expectedShock: -0.49 },
	])("applies non-zero ETF asset-class shock in $key (expected: $expectedShock)", ({
		key,
		expectedShock,
	}) => {
		const scenario = BUILT_IN_SCENARIOS.find((s) => s.key === key);
		if (!scenario) throw new Error(`Scenario ${key} not found`);

		const holding = createStressHolding({
			sector: null,
			assetClass: "etf",
			currentValue: 10000,
		});
		const result = applyShock(holding, scenario);
		expect(result.shockApplied).not.toBe(0);
		expect(result.shockApplied).toBeCloseTo(expectedShock, 4);
		expect(result.shockSource).toBe("asset_class_default");
		expect(result.betaAdjusted).toBe(false);
		expect(result.postStressValue).toBeCloseTo(10000 * (1 + expectedShock), 0);
	});

	it("clamps sector shock so post-stress value never goes below 0 (verified via FX compound)", () => {
		const holding = createStressHolding({
			sector: "Technology",
			assetClass: "equities",
			currentValue: 10000,
			currency: "EUR",
		});
		const result = applyShock(holding, GFC_2008);
		expect(result.shockApplied).toBe(-0.5);
		expect(result.postStressValue).toBe(5000);
		expect(result.betaAdjusted).toBe(false);
	});
});
