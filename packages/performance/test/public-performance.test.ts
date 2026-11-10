import { describe, expect, it } from "vitest";
import {
	evaluatePerformance,
	replayPerformance,
	PerformanceInputError,
	type PerformanceRequest,
} from "../src/index.js";
import { points, position, request, calculation } from "./public-fixtures.js";

describe("public performance API, synthetic history", () => {
	it("calculates actual returns and retains an independently reconciling residual", () => {
		const result = evaluatePerformance(request());
		expect(result.status).toBe("available");
		const c = result.calculation!;
		expect(c.timeWeightedReturn.twr).toBeCloseTo(0.1, 12);
		expect(c.timeWeightedReturn.timeSeries.at(-1)?.return).toBe(
			c.timeWeightedReturn.twr,
		);
		expect(c.attribution.holdings[0]?.contribution).toBeCloseTo(0.1, 12);
		expect(c.attribution.residualContribution).toBeCloseTo(0, 12);
		expect(c.coverage.fraction).toBe(1);
		expect(c.fundCostEstimate.deductedFromReturn).toBe(false);
		expect(c.wealthBridge.localPrice).toBeCloseTo(1_000, 12);
		expect(c.wealthBridge.residual).toBeCloseTo(0, 12);
	});

	it("integrates sold and replacement holdings rather than today's weights", () => {
		const input = request({
			snapshots: points([
				["2026-01-01", 10_000],
				["2026-01-05", 10_000],
			]),
			positions: [
				position({
					id: "old",
					currentQuantity: 0,
					prices: points([
						["2026-01-01", 100],
						["2026-01-03", 100],
					]),
				}),
				position({
					id: "new",
					currentQuantity: 100,
					annualExpenseRatio: 0.03,
					prices: points([
						["2026-01-03", 100],
						["2026-01-05", 100],
					]),
				}),
			],
			effects: [
				{
					id: "old-buy",
					holdingId: "old",
					date: "2026-01-01",
					type: "buy",
					quantity: 100,
				},
				{
					id: "old-sell",
					holdingId: "old",
					date: "2026-01-03",
					type: "sell",
					quantity: 100,
				},
				{
					id: "new-buy",
					holdingId: "new",
					date: "2026-01-03",
					type: "buy",
					quantity: 100,
				},
			],
			cashFlows: [
				{
					id: "old-sell",
					holdingId: "old",
					date: "2026-01-03",
					type: "sell",
					amount: 10_000,
				},
				{
					id: "new-buy",
					holdingId: "new",
					date: "2026-01-03",
					type: "buy",
					amount: 10_000,
				},
			],
		});
		const c = calculation(input);
		expect(c.fundCostEstimate.amount).toBeCloseTo(2.1917808219, 9);
		expect(c.fundCostEstimate.coverageFraction).toBe(1);
		expect(c.timeWeightedReturn.twr).toBe(0);
		expect(c.attribution.holdings).toHaveLength(2);
	});

	it("uses contribution dates to change cost capital without manufacturing gains", () => {
		const input = request({
			snapshots: points([
				["2026-01-01", 10_000],
				["2026-01-03", 20_000],
				["2026-01-05", 20_000],
			]),
			positions: [
				position({
					currentQuantity: 200,
					prices: points([
						["2026-01-01", 100],
						["2026-01-05", 100],
					]),
				}),
			],
			effects: [
				...request().effects,
				{
					id: "add",
					holdingId: "fund",
					date: "2026-01-03",
					type: "buy",
					quantity: 100,
				},
			],
			cashFlows: [
				{
					id: "add",
					holdingId: "fund",
					date: "2026-01-03",
					type: "buy",
					amount: 10_000,
				},
			],
		});
		const c = calculation(input);
		expect(c.timeWeightedReturn.twr).toBe(0);
		expect(c.attribution.holdings[0]?.contribution).toBe(0);
		expect(c.fundCostEstimate.amount).toBeCloseTo((60_000 * 0.01) / 365, 12);
		expect(c.wealthBridge.securityFunding).toBe(10_000);
		expect(c.wealthBridge.investmentResult).toBe(0);
	});

	it("pins GBP price and FX legs individually, not only their sum", () => {
		const input = request({
			reportingCurrency: "GBP",
			snapshots: points([
				["2026-01-01", 80],
				["2026-01-05", 99],
			]),
			positions: [
				position({
					currentQuantity: 1,
					quoteCurrency: "USD",
					prices: points([
						["2026-01-01", 100],
						["2026-01-05", 110],
					]),
					fxSource: "Synthetic USD/GBP",
					fxRates: points([
						["2026-01-01", 0.8],
						["2026-01-05", 0.9],
					]),
				}),
			],
			effects: [
				{
					id: "initial",
					holdingId: "fund",
					date: "2026-01-01",
					type: "buy",
					quantity: 1,
				},
			],
		});
		const c = calculation(input);
		expect(c.timeWeightedReturn.twr).toBeCloseTo(19 / 80, 12);
		expect(c.wealthBridge.localPrice).toBeCloseTo(8.5, 12);
		expect(c.wealthBridge.quoteFx).toBeCloseTo(10.5, 12);
		expect(c.attribution.fxAttribution?.localContribution).toBeCloseTo(
			8.5 / 80,
			12,
		);
		expect(c.attribution.fxAttribution?.fxContribution).toBeCloseTo(
			10.5 / 80,
			12,
		);
		expect(c.attribution.fxAttribution?.baseCurrency).toBe("GBP");
		expect(c.fundCostEstimate.currency).toBe("GBP");
	});

	it("keeps a future foreign purchase out of window coverage and FX requirements", () => {
		const c = calculation(
			request({
				asOfDate: "2026-02-01",
				positions: [
					position(),
					position({
						id: "future",
						quoteCurrency: "JPY",
						prices: [],
						currentQuantity: 5,
					}),
				],
				effects: [
					...request().effects,
					{
						id: "future-buy",
						holdingId: "future",
						date: "2026-02-01",
						type: "buy",
						quantity: 5,
					},
				],
			}),
		);
		expect(c.positions.find((p) => p.id === "future")?.status).toBe("not_held");
		expect(c.coverage.fraction).toBe(1);
		expect(c.fundCostEstimate.coverageFraction).toBe(1);
	});

	it("keeps unknown unlinked capital explicit at a non-snapshot boundary", () => {
		const result = evaluatePerformance(
			request({
				snapshots: points([
					["2026-01-01", 10_000],
					["2026-01-05", 20_000],
				]),
				cashFlows: [
					{
						id: "unknown",
						holdingId: null,
						date: "2026-01-03",
						type: "buy",
						amount: 10_000,
					},
				],
			}),
		);
		expect(result.status).toBe("partial");
		expect(result.calculation?.coverage.fraction).toBeNull();
		expect(result.calculation?.fundCostEstimate.coverageFraction).toBeNull();
		expect(result.calculation?.fundCostEstimate.confidence).toBeNull();
		expect(result.reasonCodes).toContain("unlinked_capital");
	});

	it("weights missing sold history by historical money rather than a small survivor", () => {
		const input = request({
			snapshots: points([
				["2026-01-01", 10_000],
				["2026-01-05", 10_000],
			]),
			positions: [
				position({
					currentQuantity: 1,
					prices: points([
						["2026-01-01", 100],
						["2026-01-05", 100],
					]),
				}),
				position({ id: "missing", currentQuantity: 0, prices: [] }),
			],
			effects: [
				{
					id: "survivor",
					holdingId: "fund",
					date: "2026-01-01",
					type: "buy",
					quantity: 1,
				},
				{
					id: "start",
					holdingId: "missing",
					date: "2026-01-01",
					type: "buy",
					quantity: 99,
				},
				{
					id: "sell",
					holdingId: "missing",
					date: "2026-01-05",
					type: "sell",
					quantity: 99,
				},
			],
			cashFlows: [
				{
					id: "sell",
					holdingId: "missing",
					date: "2026-01-05",
					type: "sell",
					amount: 9_900,
				},
			],
		});
		expect(calculation(input).coverage.fraction).toBeCloseTo(0.01, 12);
	});

	it.each([
		"prices",
		"fxRates",
	] as const)("does not carry stale %s or invent a one-to-one rate", (key) => {
		const foreign = position({
			quoteCurrency: "USD",
			prices: points([
				["2026-01-01", 100],
				["2026-01-05", 110],
			]),
			fxSource: "Synthetic",
			fxRates: points([
				["2026-01-01", 1],
				["2026-01-05", 1],
			]),
		});
		const result = evaluatePerformance(
			request({
				positions: [{ ...foreign, [key]: points([["2025-12-01", 1]]) }],
			}),
		);
		expect(result.status).toBe("partial");
		expect(result.reasonCodes).toContain("valuation_missing");
		expect(result.calculation?.coverage.fraction).toBe(0);
		expect(result.calculation?.wealthBridge.localPrice).toBeNull();
	});

	it("includes distributed dividends once in return and the monetary bridge", () => {
		const c = calculation(
			request({
				positions: [
					position({
						prices: points([
							["2026-01-01", 100],
							["2026-01-05", 100],
						]),
					}),
				],
				snapshots: points([
					["2026-01-01", 10_000],
					["2026-01-05", 10_000],
				]),
				cashFlows: [
					{
						id: "income",
						holdingId: "fund",
						date: "2026-01-01",
						type: "dividend",
						amount: 100,
					},
				],
			}),
		);
		expect(c.timeWeightedReturn.twr).toBeCloseTo(0.01, 12);
		expect(c.attribution.holdings[0]?.contribution).toBeCloseTo(0.01, 12);
		expect(c.wealthBridge.distributedIncome).toBe(100);
		expect(c.wealthBridge.investmentResult).toBe(100);
		expect(c.wealthBridge.residual).toBe(0);
	});

	it("does not deduct current-rate estimates again from observed returns", () => {
		const a = calculation(request());
		const b = calculation(
			request({ positions: [position({ annualExpenseRatio: 0.2 })] }),
		);
		expect(b.fundCostEstimate.amount).toBeGreaterThan(
			a.fundCostEstimate.amount,
		);
		expect(b.timeWeightedReturn).toEqual(a.timeWeightedReturn);
		expect(b.wealthBridge).toEqual(a.wealthBridge);
	});

	it("keeps unknown recorded costs distinct from explicit zero and supports tax gaps", () => {
		const { recordedCosts: _costs, ...unknownCosts } = request();
		expect(calculation(unknownCosts).wealthBridge.recordedFees).toBeNull();
		expect(calculation(request()).wealthBridge.recordedFees).toBe(0);
		const c = calculation(
			request({
				recordedCosts: [
					{ date: "2026-01-03", holdingId: "fund", fees: 5, taxes: null },
				],
			}),
		);
		expect(c.wealthBridge.recordedFees).toBe(5);
		expect(c.wealthBridge.recordedTaxes).toBeNull();
		expect(c.wealthBridge.residual).toBe(5);
	});

	it("withholds incomplete ledgers and insufficient history", () => {
		expect(
			evaluatePerformance(request({ ledgerComplete: false })),
		).toMatchObject({
			status: "unavailable",
			calculation: null,
			reasonCodes: ["incomplete_ledger"],
		});
		expect(evaluatePerformance(request({ snapshots: [] }))).toMatchObject({
			status: "unavailable",
			calculation: null,
			reasonCodes: ["insufficient_history"],
		});
	});
	it("refuses an undefined return from zero capital rather than publishing zero", () => {
		const result = evaluatePerformance(
			request({
				snapshots: points([
					["2026-01-01", 0],
					["2026-01-05", 100],
				]),
				positions: [],
				effects: [],
			}),
		);
		expect(result).toMatchObject({
			status: "unavailable",
			calculation: null,
			reasonCodes: ["undefined_subperiod"],
		});
	});

	it("excludes unsupported mergers and negative histories", () => {
		const merged = evaluatePerformance(
			request({
				effects: [
					...request().effects,
					{
						id: "merger",
						holdingId: "fund",
						date: "2026-01-03",
						type: "merger",
						quantity: 0,
					},
				],
			}),
		);
		expect(merged.calculation?.positions[0]).toMatchObject({
			status: "excluded",
			reason: "unsupported_position_effect",
		});
		expect(merged.calculation?.attribution.holdings).toEqual([]);
		const negative = calculation(
			request({
				effects: [
					{
						id: "buy",
						holdingId: "fund",
						date: "2026-01-05",
						type: "buy",
						quantity: 200,
					},
				],
				cashFlows: [
					{
						id: "buy",
						holdingId: "fund",
						date: "2026-01-05",
						type: "buy",
						amount: 20_000,
					},
				],
			}),
		);
		expect(negative.positions[0]?.reason).toBe("negative_position_history");
	});

	it("preserves split quantities without inventing a bridge price gain", () => {
		const c = calculation(
			request({
				positions: [
					position({
						currentQuantity: 200,
						prices: points([
							["2026-01-01", 100],
							["2026-01-03", 50],
							["2026-01-05", 50],
						]),
					}),
				],
				snapshots: points([
					["2026-01-01", 10_000],
					["2026-01-03", 10_000],
					["2026-01-05", 10_000],
				]),
				effects: [
					...request().effects,
					{
						id: "split",
						holdingId: "fund",
						date: "2026-01-03",
						type: "split",
						quantity: 0,
						splitRatio: 2,
					},
				],
			}),
		);
		expect(c.timeWeightedReturn.twr).toBe(0);
		expect(c.replay[0]?.finalQuantity).toBe(200);
		expect(c.wealthBridge.unvaluedIntervalCount).toBe(1);
	});

	it("calculates annual MWR from opening wealth and in-window capital", () => {
		const c = calculation(
			request({
				asOfDate: "2026-01-01",
				snapshots: points([
					["2025-01-01", 1_000],
					["2026-01-01", 1_100],
				]),
				positions: [],
				effects: [],
			}),
		);
		expect(c.moneyWeightedReturn.mwr).toBeCloseTo(0.1, 6);
		expect(c.moneyWeightedReturn.isAnnualized).toBe(true);
	});

	it("replays JSON inputs exactly and isolates caller mutation", () => {
		const input = request();
		const result = evaluatePerformance(input);
		expect(
			replayPerformance(JSON.parse(JSON.stringify(result.snapshot))),
		).toEqual(result);
		(input.positions[0]!.prices[0] as { value: number }).value = 5;
		expect(result.snapshot.request.positions[0]?.prices[0]?.value).toBe(100);
		expect(() =>
			replayPerformance({
				...result.snapshot,
				methodologyVersion: "unknown",
			} as never),
		).toThrow(PerformanceInputError);
	});
});
