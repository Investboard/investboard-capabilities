import { describe, expect, it } from "vitest";
import { computePortfolioImpact } from "../impact-calculator.js";
import { applyReturnToValue, scenarioFxRatio } from "../scenario-fx.js";
import { BUILT_IN_SCENARIOS } from "../scenarios/crisis-definitions.js";

describe("reporting-currency stress", () => {
	const crisis = {
		...BUILT_IN_SCENARIOS[0]!,
		currencyShocks: { EUR: 0.99, USD: -0.2, GBP: 0.1 },
		assetClassShocks: { cash: 0 },
	};
	it("divides cross-currency gross factors and ignores EUR basket metadata", () => {
		expect(scenarioFxRatio(crisis, "USD", "USD")).toBe(1);
		expect(scenarioFxRatio(crisis, "EUR", "USD")).toBe(1.25);
		expect(scenarioFxRatio(crisis, "GBP", "USD")).toBeCloseTo(1.375, 12);
		expect(scenarioFxRatio(crisis, "JPY", "USD")).toBeNull();
		expect(
			scenarioFxRatio({ ...crisis, currencyShocks: { USD: -1 } }, "EUR", "USD"),
		).toBeNull();
	});
	it("values the same scenario in the selected base without converting capital twice", () => {
		const holdings = [
			{
				holdingId: "one",
				ticker: "EUR",
				name: "EUR cash",
				sector: null,
				assetClass: "cash",
				instrumentType: "cash",
				currency: "EUR",
				currentValue: 100,
			},
		];
		expect(computePortfolioImpact(holdings, crisis, "USD")).toMatchObject({
			preStressTotal: 100,
			postStressTotal: 125,
			absoluteLoss: 25,
		});
		expect(computePortfolioImpact(holdings, crisis, "EUR")).toMatchObject({
			preStressTotal: 100,
			postStressTotal: 100,
			absoluteLoss: 0,
		});
	});
	it.each([
		[2.01, -0.5, 1.01],
		[2.05, -0.9, 0.21],
		[1.5, -0.57, 0.65],
	])("rounds a decimal midpoint without floating-point loss: %j", (value, shock, expected) => {
		expect(applyReturnToValue(value, shock).postStressValue).toBe(expected);
	});
	it("keeps a value materially below a half-cent below the midpoint", () => {
		expect(applyReturnToValue(1, -0.99500001).postStressValue).toBe(0);
	});
	it("uses the same monetary convention for a measured return and a scenario", () => {
		expect(applyReturnToValue(100, -0.25)).toEqual({
			preStressValue: 100,
			postStressValue: 75,
			absoluteLoss: -25,
			percentageLoss: -0.25,
		});
		expect(applyReturnToValue(100, 0).absoluteLoss).toBe(0);
		expect(() => applyReturnToValue(100, -1.01)).toThrow();
	});
});
