// Synthetic regression fixtures. Copyright 2026 Investboard GmbH. Apache-2.0
import { describe, expect, it } from "vitest";
import { aggregateFxAttribution } from "../src/internal/performance/fx-attribution.js";
describe("FX attribution", () => {
	it("Frongello-links local and FX effects into reconciled currency rows", () => {
		const result = aggregateFxAttribution({
			holdings: [
				{
					id: "usd-a",
					label: "USD A",
					startWeightPct: 60,
					endWeightPct: 55,
					contribution: 0.065,
					contributionPp: 6.5,
				},
				{
					id: "eur-b",
					label: "EUR B",
					startWeightPct: 40,
					endWeightPct: 45,
					contribution: 0.04,
					contributionPp: 4,
				},
			],
			effects: [
				{
					holdingId: "usd-a",
					currency: "usd",
					periodIndex: 0,
					localContribution: 0.08,
					fxContribution: -0.03,
				},
				{
					holdingId: "usd-a",
					currency: "USD",
					periodIndex: 1,
					localContribution: 0.02,
					fxContribution: -0.01,
				},
				{
					holdingId: "eur-b",
					currency: "EUR",
					periodIndex: 0,
					localContribution: 0.04 / 1.1,
					fxContribution: 0,
				},
			],
			futureFactors: [1.1, 1],
			expectedEffectCount: 3,
		});
		expect(result).not.toBeNull();
		expect(result?.rows[0]).toMatchObject({
			key: "USD",
			holdingCount: 1,
			startWeightPct: 60,
			endWeightPct: 55,
		});
		expect(result?.rows[0]?.localContribution).toBeCloseTo(0.108, 12);
		expect(result?.rows[0]?.fxContribution).toBeCloseTo(-0.043, 12);
		expect(result?.rows[0]?.combinedContribution).toBeCloseTo(0.065, 12);
		expect(result?.fxContribution).toBeCloseTo(-0.043, 12);
		expect(result?.localContribution).toBeCloseTo(0.148, 12);
		expect(result?.reconciliationGap).toBeCloseTo(0, 12);
	});
	it("returns null when no caller-supplied dated FX legs were decomposed", () => {
		expect(
			aggregateFxAttribution({
				holdings: [],
				effects: [],
				futureFactors: [],
				expectedEffectCount: 0,
			}),
		).toBeNull();
	});
	it("withholds a partial or invalid-currency decomposition", () => {
		const holdings = [
			{
				id: "usd-a",
				label: "USD A",
				startWeightPct: 100,
				endWeightPct: 100,
				contribution: 0.1,
				contributionPp: 10,
			},
		];
		expect(
			aggregateFxAttribution({
				holdings,
				effects: [
					{
						holdingId: "usd-a",
						currency: "USD",
						periodIndex: 0,
						localContribution: 0.04,
						fxContribution: 0.01,
					},
				],
				futureFactors: [1],
				expectedEffectCount: 1,
			}),
		).toBeNull();
		expect(
			aggregateFxAttribution({
				holdings,
				effects: [
					{
						holdingId: "usd-a",
						currency: "US",
						periodIndex: 0,
						localContribution: 0.08,
						fxContribution: 0.02,
					},
				],
				futureFactors: [1],
				expectedEffectCount: 1,
			}),
		).toBeNull();
	});
	it("withholds when missing holding effects cancel in the aggregate", () => {
		expect(
			aggregateFxAttribution({
				holdings: [
					{
						id: "eur-a",
						label: "EUR A",
						startWeightPct: 50,
						endWeightPct: 50,
						contribution: 0.1,
						contributionPp: 10,
					},
					{
						id: "usd-b",
						label: "USD B",
						startWeightPct: 50,
						endWeightPct: 50,
						contribution: 0,
						contributionPp: 0,
					},
				],
				effects: [
					{
						holdingId: "eur-a",
						currency: "EUR",
						periodIndex: 0,
						localContribution: 0.1,
						fxContribution: 0,
					},
				],
				futureFactors: [1],
				expectedEffectCount: 2,
			}),
		).toBeNull();
	});
	it("withholds effects that do not belong to a covered holding", () => {
		expect(
			aggregateFxAttribution({
				holdings: [
					{
						id: "known",
						label: "Known",
						startWeightPct: 100,
						endWeightPct: 100,
						contribution: 0.1,
						contributionPp: 10,
					},
				],
				effects: [
					{
						holdingId: "missing",
						currency: "USD",
						periodIndex: 0,
						localContribution: 0.12,
						fxContribution: -0.02,
					},
				],
				futureFactors: [1],
				expectedEffectCount: 1,
			}),
		).toBeNull();
	});
});
