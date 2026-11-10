// Synthetic regression fixtures. Copyright 2026 Investboard GmbH. Apache-2.0
import { describe, expect, it } from "vitest";
import { calculateHoldingAttribution } from "../src/internal/performance/holding-attribution.js";
describe("holding attribution", () => {
	it("attributes a single period and reconciles exactly", () => {
		const result = calculateHoldingAttribution({
			snapshots: [
				{ date: "2026-01-01", value: 100 },
				{ date: "2026-01-31", value: 120 },
			],
			cashFlows: [],
			holdings: [
				{
					id: "a",
					label: "AAA",
					values: [
						{ date: "2026-01-01", value: 60 },
						{ date: "2026-01-31", value: 72 },
					],
				},
				{
					id: "b",
					label: "BBB",
					values: [
						{ date: "2026-01-01", value: 40 },
						{ date: "2026-01-31", value: 48 },
					],
				},
			],
		});
		expect(result.status).toBe("ready");
		expect(result.totalReturn).toBeCloseTo(0.2, 12);
		expect(
			result.holdings.find((row) => row.id === "a")?.contribution,
		).toBeCloseTo(0.12, 12);
		expect(
			result.holdings.find((row) => row.id === "b")?.contribution,
		).toBeCloseTo(0.08, 12);
		expect(result.residualContribution).toBeCloseTo(0, 12);
		expect(result.rawReconciliationGap).toBeCloseTo(0, 12);
		expect(result.reconciliationGap).toBe(0);
	});
	it("splits quote-price and FX effects symmetrically in base currency", () => {
		const result = calculateHoldingAttribution({
			snapshots: [
				{ date: "2026-01-01", value: 90 },
				{ date: "2026-01-31", value: 88 },
			],
			cashFlows: [],
			holdings: [
				{
					id: "usd",
					label: "USD holding",
					currency: "USD",
					values: [
						{ date: "2026-01-01", value: 90 },
						{ date: "2026-01-31", value: 88 },
					],
					fxRates: [
						{ date: "2026-01-01", value: 0.9 },
						{ date: "2026-01-31", value: 0.8 },
					],
				},
			],
		});
		const fx = result.fxAttribution;
		expect(fx).not.toBeNull();
		expect(fx?.fxContribution).toBeCloseTo(-10.5 / 90, 12);
		expect(fx?.localContribution).toBeCloseTo(8.5 / 90, 12);
		expect(fx?.localContribution).toBeCloseTo(
			((110 - 100) * (0.9 + 0.8) * 0.5) / 90,
			12,
		);
		expect(fx?.rows[0]?.combinedContribution).toBeCloseTo(-2 / 90, 12);
		expect(fx?.reconciliationGap).toBeCloseTo(0, 12);
	});
	it("splits quote-price and FX effects for an appreciating currency", () => {
		const result = calculateHoldingAttribution({
			snapshots: [
				{ date: "2026-01-01", value: 80 },
				{ date: "2026-01-31", value: 110 },
			],
			cashFlows: [],
			holdings: [
				{
					id: "usd",
					label: "USD holding",
					currency: "USD",
					values: [
						{ date: "2026-01-01", value: 80 },
						{ date: "2026-01-31", value: 110 },
					],
					fxRates: [
						{ date: "2026-01-01", value: 0.8 },
						{ date: "2026-01-31", value: 1.0 },
					],
				},
			],
		});
		const fx = result.fxAttribution;
		expect(fx).not.toBeNull();
		expect(fx?.fxContribution).toBeCloseTo(21 / 80, 12);
		expect(fx?.localContribution).toBeCloseTo(9 / 80, 12);
		expect(fx?.rows[0]?.combinedContribution).toBeCloseTo(30 / 80, 12);
		expect(fx?.reconciliationGap).toBeCloseTo(0, 12);
		expect(fx?.fxContribution ?? 0).toBeGreaterThan(0);
	});
	it("preserves the FX split across a buy boundary and Frongello linking", () => {
		const result = calculateHoldingAttribution({
			snapshots: [
				{ date: "2026-01-01", value: 100 },
				{ date: "2026-01-15", value: 160 },
				{ date: "2026-01-31", value: 158.4 },
			],
			cashFlows: [
				{
					date: "2026-01-15",
					amount: 50,
					type: "buy",
					holdingId: "usd",
				},
			],
			holdings: [
				{
					id: "usd",
					label: "USD holding",
					currency: "USD",
					values: [
						{ date: "2026-01-01", value: 100 },
						{ date: "2026-01-15", value: 160 },
						{ date: "2026-01-31", value: 158.4 },
					],
					fxRates: [
						{ date: "2026-01-01", value: 1 },
						{ date: "2026-01-15", value: 1 },
						{ date: "2026-01-31", value: 0.9 },
					],
				},
			],
		});
		expect(result.totalReturn).toBeCloseTo(0.089, 12);
		expect(result.fxAttribution?.localContribution).toBeCloseTo(0.194, 12);
		expect(result.fxAttribution?.fxContribution).toBeCloseTo(-0.105, 12);
		expect(result.fxAttribution?.reconciliationGap).toBeCloseTo(0, 12);
	});
	it("withholds FX when an exposed holding-period lacks a dated rate", () => {
		const result = calculateHoldingAttribution({
			snapshots: [
				{ date: "2026-01-01", value: 200 },
				{ date: "2026-01-31", value: 220 },
			],
			cashFlows: [],
			holdings: [
				{
					id: "eur",
					label: "EUR holding",
					currency: "EUR",
					values: [
						{ date: "2026-01-01", value: 100 },
						{ date: "2026-01-31", value: 120 },
					],
					fxRates: [
						{ date: "2026-01-01", value: 1 },
						{ date: "2026-01-31", value: 1 },
					],
				},
				{
					id: "usd",
					label: "USD holding",
					currency: "USD",
					values: [
						{ date: "2026-01-01", value: 100 },
						{ date: "2026-01-31", value: 100 },
					],
					fxRates: [
						{ date: "2026-01-01", value: 1 },
						{ date: "2026-01-31", value: null },
					],
				},
			],
		});
		expect(result.holdings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: "eur", contribution: 0.1 }),
				expect.objectContaining({ id: "usd", contribution: 0 }),
			]),
		);
		expect(result.fxAttribution).toBeNull();
	});
	it("Frongello-links flow-boundary contributions to the headline TWR", () => {
		const result = calculateHoldingAttribution({
			snapshots: [
				{ date: "2026-01-01", value: 100 },
				{ date: "2026-01-15", value: 160 },
				{ date: "2026-01-31", value: 176 },
			],
			cashFlows: [
				{
					date: "2026-01-15",
					amount: 50,
					type: "buy",
					holdingId: "b",
				},
			],
			holdings: [
				{
					id: "a",
					label: "AAA",
					values: [
						{ date: "2026-01-01", value: 100 },
						{ date: "2026-01-15", value: 110 },
						{ date: "2026-01-31", value: 121 },
					],
				},
				{
					id: "b",
					label: "BBB",
					values: [
						{ date: "2026-01-01", value: 0 },
						{ date: "2026-01-15", value: 50 },
						{ date: "2026-01-31", value: 55 },
					],
				},
			],
		});
		expect(result.totalReturn).toBeCloseTo(0.21, 12);
		expect(
			result.holdings.find((row) => row.id === "a")?.contribution,
		).toBeCloseTo(0.17875, 12);
		expect(
			result.holdings.find((row) => row.id === "b")?.contribution,
		).toBeCloseTo(0.03125, 12);
		expect(result.residualContribution).toBeCloseTo(0, 12);
	});
	it("keeps uncovered portfolio return in an explicit residual", () => {
		const result = calculateHoldingAttribution({
			snapshots: [
				{ date: "2026-01-01", value: 100 },
				{ date: "2026-01-31", value: 120 },
			],
			cashFlows: [],
			holdings: [
				{
					id: "a",
					label: "AAA",
					values: [
						{ date: "2026-01-01", value: 50 },
						{ date: "2026-01-31", value: 60 },
					],
				},
			],
		});
		expect(result.holdings[0]?.contribution).toBeCloseTo(0.1, 12);
		expect(result.residualContribution).toBeCloseTo(0.1, 12);
		expect(
			(result.holdings[0]?.contribution ?? 0) + result.residualContribution,
		).toBeCloseTo(result.totalReturn, 12);
	});
	it("attributes gross dividends to their holding", () => {
		const result = calculateHoldingAttribution({
			snapshots: [
				{ date: "2026-01-01", value: 100 },
				{ date: "2026-01-31", value: 100 },
			],
			cashFlows: [
				{
					date: "2026-01-20",
					amount: 5,
					type: "dividend",
					holdingId: "a",
				},
			],
			holdings: [
				{
					id: "a",
					label: "AAA",
					values: [
						{ date: "2026-01-01", value: 100 },
						{ date: "2026-01-31", value: 100 },
					],
				},
			],
		});
		expect(result.totalReturn).toBeCloseTo(0.05, 12);
		expect(result.holdings[0]?.contribution).toBeCloseTo(0.05, 12);
		expect(result.residualContribution).toBeCloseTo(0, 12);
	});
	it("attributes dividends to the independently calculated local leg", () => {
		const result = calculateHoldingAttribution({
			snapshots: [
				{ date: "2026-01-01", value: 90 },
				{ date: "2026-01-31", value: 88 },
			],
			cashFlows: [
				{
					date: "2026-01-20",
					amount: 9,
					type: "dividend",
					holdingId: "usd",
				},
			],
			holdings: [
				{
					id: "usd",
					label: "USD holding",
					currency: "USD",
					values: [
						{ date: "2026-01-01", value: 90 },
						{ date: "2026-01-31", value: 88 },
					],
					fxRates: [
						{ date: "2026-01-01", value: 0.9 },
						{ date: "2026-01-31", value: 0.8 },
					],
				},
			],
		});
		const expectedLocalPrice = ((110 - 100) * (0.9 + 0.8) * 0.5) / 90;
		expect(result.fxAttribution?.localContribution).toBeCloseTo(
			expectedLocalPrice + 9 / 90,
			12,
		);
		expect(result.fxAttribution?.fxContribution).toBeCloseTo(-10.5 / 90, 12);
	});
	it("withholds rows when the headline has an undefined subperiod", () => {
		const result = calculateHoldingAttribution({
			snapshots: [
				{ date: "2026-01-01", value: 0 },
				{ date: "2026-01-31", value: 0 },
			],
			cashFlows: [
				{
					date: "2026-01-20",
					amount: 5,
					type: "dividend",
					holdingId: "a",
				},
			],
			holdings: [],
		});
		expect(result.status).toBe("withheld");
		expect(result.withheldReason).toBe("undefined_subperiod");
		expect(result.holdings).toEqual([]);
	});
});
