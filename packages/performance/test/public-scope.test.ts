import { describe, expect, it } from "vitest";
import {
	evaluatePerformance,
	replayPerformance,
	PerformanceInputError,
	type PerformanceRequest,
} from "../src/index.js";
import { points, position, request, calculation } from "./public-fixtures.js";

describe("fixed historical basket", () => {
	const mixed = (): PerformanceRequest =>
		request({
			snapshots: points([
				["2026-01-01", 20_000],
				["2026-01-05", 20_000],
			]),
			positions: [
				position(),
				position({
					id: "other",
					annualExpenseRatio: 0.03,
					prices: points([
						["2026-01-01", 100],
						["2026-01-05", 90],
					]),
				}),
			],
			effects: [
				...request().effects,
				{
					id: "other-initial",
					holdingId: "other",
					date: "2026-01-01",
					type: "buy",
					quantity: 100,
				},
			],
		});
	it("uses the selected basket for NAV, return, attribution, cost and bridge", () => {
		const whole = calculation(mixed());
		const selected = calculation({ ...mixed(), scopeHoldingIds: ["fund"] });
		expect(whole.timeWeightedReturn.twr).toBe(0);
		expect(selected.timeWeightedReturn.twr).toBeCloseTo(0.1, 12);
		expect(selected.wealthBridge.openingWealth).toBe(10_000);
		expect(selected.wealthBridge.closingWealth).toBe(11_000);
		expect(selected.attribution.holdings.map((h) => h.id)).toEqual(["fund"]);
		expect(selected.fundCostEstimate.amount).toBeCloseTo(
			(10_000 * 0.01 * 4) / 365,
			12,
		);
	});
	it("refuses a scoped result when an in-window flow cannot be assigned", () => {
		const input = {
			...mixed(),
			scopeHoldingIds: ["fund"],
			cashFlows: [
				{
					id: "unknown",
					holdingId: null,
					date: "2026-01-03",
					type: "buy" as const,
					amount: 100,
				},
			],
		};
		expect(evaluatePerformance(input)).toMatchObject({
			status: "unavailable",
			calculation: null,
			reasonCodes: ["scope_history_missing"],
		});
	});
	it("refuses missing selected valuations without mixing whole-book returns", () => {
		const input = mixed();
		expect(
			evaluatePerformance({
				...input,
				scopeHoldingIds: ["fund"],
				positions: [position({ prices: [] }), input.positions[1]!],
			}).status,
		).toBe("unavailable");
	});
});
