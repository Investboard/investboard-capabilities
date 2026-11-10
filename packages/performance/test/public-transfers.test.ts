import { describe, expect, it } from "vitest";
import {
	evaluatePerformance,
	replayPerformance,
	PerformanceInputError,
	type PerformanceRequest,
} from "../src/index.js";
import { points, position, request, calculation } from "./public-fixtures.js";

describe("custody transfers", () => {
	const transferRequest = (): PerformanceRequest =>
		request({
			snapshots: points([
				["2026-01-01", 10_000],
				["2026-01-03", 10_000],
				["2026-01-05", 11_000],
			]),
			positions: [
				position({
					id: "old",
					instrumentId: "synthetic-fund",
					currentQuantity: 0,
				}),
				position({ id: "new", instrumentId: "synthetic-fund" }),
			],
			effects: [
				{
					id: "initial",
					holdingId: "old",
					date: "2026-01-01",
					type: "buy",
					quantity: 100,
				},
				{
					id: "out",
					holdingId: "old",
					date: "2026-01-03",
					type: "transfer",
					quantity: -100,
					transferGroup: "move",
				},
				{
					id: "in",
					holdingId: "new",
					date: "2026-01-03",
					type: "transfer",
					quantity: 100,
					transferGroup: "move",
				},
			],
		});
	it("balances observed internal transfers without external capital or holding gain", () => {
		const c = calculation(transferRequest());
		expect(c.transfers).toMatchObject([{ internal: true, value: 10_000 }]);
		expect(c.timeWeightedReturn.twr).toBeCloseTo(0.1, 12);
		expect(
			c.attribution.holdings.reduce((sum, h) => sum + h.contribution, 0),
		).toBeCloseTo(0.1, 12);
		expect(c.wealthBridge.securityFunding).toBe(0);
		expect(c.wealthBridge.localPrice).toBe(1_000);
	});
	it("requires an observed transfer boundary rather than inserting carried NAV", () => {
		const input = transferRequest();
		expect(
			evaluatePerformance({
				...input,
				snapshots: input.snapshots.filter((p) => p.date !== "2026-01-03"),
			}),
		).toMatchObject({
			status: "unavailable",
			reasonCodes: ["transfer_valuation_missing"],
		});
	});
	it("refuses mismatched transfer pricing evidence", () => {
		const input = transferRequest();
		expect(
			evaluatePerformance({
				...input,
				positions: [
					input.positions[0]!,
					{
						...input.positions[1]!,
						prices: points([
							["2026-01-03", 101],
							["2026-01-05", 110],
						]),
					},
				],
			}).status,
		).toBe("unavailable");
	});
	it("values a single scope-crossing transfer as funding", () => {
		const c = calculation(
			request({
				snapshots: points([
					["2026-01-01", 0],
					["2026-01-03", 10_000],
					["2026-01-05", 10_000],
				]),
				positions: [
					position({
						prices: points([
							["2026-01-03", 100],
							["2026-01-05", 100],
						]),
					}),
				],
				effects: [
					{
						id: "in",
						holdingId: "fund",
						date: "2026-01-03",
						type: "transfer",
						quantity: 100,
					},
				],
			}),
		);
		expect(c.transfers[0]).toMatchObject({ internal: false, value: 10_000 });
		expect(c.wealthBridge.securityFunding).toBe(10_000);
		expect(c.wealthBridge.investmentResult).toBe(0);
		expect(c.timeWeightedReturn.twr).toBe(0);
	});
	it("projects a custody scope before computing funding and return", () => {
		const result = evaluatePerformance({
			...transferRequest(),
			scopeHoldingIds: ["new"],
		});
		expect(result.calculation?.scope.navBasis).toBe("reconstructed");
		expect(result.calculation?.wealthBridge.openingWealth).toBe(0);
		expect(result.calculation?.wealthBridge.securityFunding).toBe(10_000);
		expect(result.calculation?.wealthBridge.investmentResult).toBe(1_000);
		expect(result.calculation?.timeWeightedReturn.twr).toBeCloseTo(0.1, 12);
		expect(
			replayPerformance(JSON.parse(JSON.stringify(result.snapshot))),
		).toEqual(result);
	});
});
