import { describe, expect, it } from "vitest";
import {
	evaluatePerformance,
	replayPerformance,
	PerformanceInputError,
	type PerformanceRequest,
} from "../src/index.js";
import { points, position, request, calculation } from "./public-fixtures.js";

describe("public input boundary", () => {
	it.each([
		{ reportingCurrency: "eur" },
		{ asOfDate: "2026-02-30" },
		{ ledgerComplete: undefined },
		{
			snapshots: points([
				["2026-01-05", 10],
				["2026-01-01", 10],
			]),
		},
		{ snapshots: points([["2026-01-01", Number.NaN]]) },
		{ snapshots: points([["2026-01-01", 0.001]]) },
		{ snapshots: points([["2026-01-01", 1_000_000_001]]) },
		{ positions: [position(), position()] },
		{ positions: [position({ currentQuantity: -1 })] },
		{
			positions: [
				position({
					fxRates: points([["2026-01-01", 0.5]]),
					fxSource: "Synthetic",
				}),
			],
		},
		{ positions: [position({ annualExpenseRatio: -0.01 })] },
		{
			cashFlows: [
				{
					id: "bad",
					holdingId: "missing",
					date: "2026-01-03",
					type: "buy",
					amount: 100,
				},
			],
		},
		{
			effects: [
				{
					id: "buy",
					holdingId: "fund",
					date: "2026-01-03",
					type: "buy",
					quantity: 1,
				},
			],
		},
		{
			effects: [
				{
					id: "split",
					holdingId: "fund",
					date: "2026-01-03",
					type: "split",
					quantity: 0,
					splitRatio: 0,
				},
			],
		},
		{ privateAccount: "must not be retained" },
	])("rejects invalid or unsupported input %#", (change) => {
		expect(() =>
			evaluatePerformance({ ...request(), ...change } as PerformanceRequest),
		).toThrow(PerformanceInputError);
	});
	it("rejects accessors without evaluating them", () => {
		let read = false;
		const input = Object.defineProperty(request(), "reportingCurrency", {
			enumerable: true,
			get() {
				read = true;
				return "EUR";
			},
		});
		expect(() => evaluatePerformance(input)).toThrow(PerformanceInputError);
		expect(read).toBe(false);
	});
	it("rejects cycles, sparse arrays, custom prototypes and non-JSON values", () => {
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		for (const data of [
			cyclic,
			new Date(),
			{ ...request(), cashFlows: new Array(2) },
			{ ...request(), extra: () => 1 },
			{ ...request(), extra: 1n },
		])
			expect(() => evaluatePerformance(data as PerformanceRequest)).toThrow(
				PerformanceInputError,
			);
	});
});
