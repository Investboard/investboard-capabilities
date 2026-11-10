// Synthetic regression fixtures. Copyright 2026 Investboard GmbH. Apache-2.0
import { describe, expect, it } from "vitest";
import {
	replayPositionHistory,
	simulateEffectNet,
	solveOpeningQuantity,
} from "../src/internal/performance/position-replay.js";
describe("actual position replay", () => {
	it("shares the affine split/trade arithmetic used by imports", () => {
		const net = simulateEffectNet([
			{ type: "buy", quantity: 5 },
			{ type: "split", quantity: 0, splitRatio: 2 },
			{ type: "sell", quantity: 4 },
		]);
		expect(net).toEqual({ a: 2, b: 6 });
		expect(solveOpeningQuantity(10, net)).toBe(2);
	});
	it("reconstructs post-effect quantities from a fully-backed ledger", () => {
		const result = replayPositionHistory({
			positions: [
				{
					id: "holding-a",
					label: "AAA",
					currentQuantity: 8,
					anchorDate: "2026-01-01",
				},
			],
			effects: [
				{
					id: "buy-1",
					holdingId: "holding-a",
					date: "2026-01-02",
					type: "buy",
					quantity: 5,
				},
				{
					id: "split-1",
					holdingId: "holding-a",
					date: "2026-01-03",
					type: "split",
					quantity: 0,
					splitRatio: 2,
				},
				{
					id: "sell-1",
					holdingId: "holding-a",
					date: "2026-01-04",
					type: "sell",
					quantity: 2,
				},
			],
			valuationDates: ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"],
		});
		const position = result.positions[0];
		if (!position) throw new Error("expected replayed position");
		expect(position.source).toBe("ledger");
		expect(position.openingQuantity).toBe(0);
		expect(position.points.map((point) => point.quantity)).toEqual([
			0, 5, 10, 8,
		]);
		expect(position.finalQuantity).toBe(8);
		expect(position.minimumQuantity).toBe(0);
		expect(position.wentNegative).toBe(false);
		expect(position.reconcilesToCurrent).toBe(true);
	});
	it("retains unexplained quantity as a provenance-bearing opening balance", () => {
		const result = replayPositionHistory({
			positions: [
				{
					id: "holding-a",
					label: "AAA",
					currentQuantity: 15,
					anchorDate: "2026-01-02",
				},
			],
			effects: [
				{
					id: "buy-1",
					holdingId: "holding-a",
					date: "2026-01-03",
					type: "buy",
					quantity: 5,
				},
			],
			valuationDates: ["2026-01-01", "2026-01-02", "2026-01-03"],
		});
		const position = result.positions[0];
		if (!position) throw new Error("expected replayed position");
		expect(position.source).toBe("opening_balance");
		expect(position.openingQuantity).toBe(10);
		expect(position.effectiveFrom).toBe("2026-01-02");
		expect(position.points.map((point) => point.quantity)).toEqual([0, 10, 15]);
		expect(position.reconcilesToCurrent).toBe(true);
	});
	it("uses split-first ordering for same-day effects", () => {
		const result = replayPositionHistory({
			positions: [
				{
					id: "holding-a",
					label: "AAA",
					currentQuantity: 25,
					anchorDate: "2026-01-01",
				},
			],
			effects: [
				{
					id: "buy",
					holdingId: "holding-a",
					date: "2026-01-02",
					type: "buy",
					quantity: 5,
				},
				{
					id: "split",
					holdingId: "holding-a",
					date: "2026-01-02",
					type: "split",
					quantity: 0,
					splitRatio: 2,
				},
			],
			valuationDates: ["2026-01-01", "2026-01-02"],
		});
		const position = result.positions[0];
		if (!position) throw new Error("expected replayed position");
		expect(position.openingQuantity).toBe(10);
		expect(position.points[1]?.quantity).toBe(25);
	});
	it("reports unsupported merger effects instead of applying them", () => {
		const result = replayPositionHistory({
			positions: [
				{
					id: "holding-a",
					label: "AAA",
					currentQuantity: 1,
					anchorDate: "2026-01-01",
				},
			],
			effects: [
				{
					id: "merger-1",
					holdingId: "holding-a",
					date: "2026-01-02",
					type: "merger",
					quantity: 1,
				},
			],
			valuationDates: ["2026-01-02"],
		});
		expect(result.unsupportedEffectIds).toEqual(["merger-1"]);
		expect(result.unsupportedHoldingIds).toEqual(["holding-a"]);
	});
	it("records an intermediate negative position even when the final quantity reconciles", () => {
		const result = replayPositionHistory({
			positions: [
				{
					id: "holding-a",
					label: "AAA",
					currentQuantity: 5,
					anchorDate: "2026-01-01",
				},
			],
			effects: [
				{
					id: "sell-1",
					holdingId: "holding-a",
					date: "2026-01-02",
					type: "sell",
					quantity: 10,
					order: 1,
				},
				{
					id: "buy-1",
					holdingId: "holding-a",
					date: "2026-01-03",
					type: "buy",
					quantity: 10,
					order: 2,
				},
			],
			valuationDates: ["2026-01-01", "2026-01-02", "2026-01-03"],
		});
		const position = result.positions[0];
		if (!position) throw new Error("expected replayed position");
		expect(position.points.map((point) => point.quantity)).toEqual([5, -5, 5]);
		expect(position.minimumQuantity).toBe(-5);
		expect(position.wentNegative).toBe(true);
		expect(position.reconcilesToCurrent).toBe(true);
	});
	it("preserves same-day ledger order when checking for a temporary short", () => {
		const result = replayPositionHistory({
			positions: [
				{
					id: "holding-a",
					label: "AAA",
					currentQuantity: 5,
					anchorDate: "2026-01-01",
				},
			],
			effects: [
				{
					id: "sell-1",
					holdingId: "holding-a",
					date: "2026-01-02",
					type: "sell",
					quantity: 10,
					order: 1,
				},
				{
					id: "buy-1",
					holdingId: "holding-a",
					date: "2026-01-02",
					type: "buy",
					quantity: 10,
					order: 2,
				},
			],
			valuationDates: ["2026-01-01", "2026-01-02"],
		});
		const position = result.positions[0];
		if (!position) throw new Error("expected replayed position");
		expect(position.points.map((point) => point.quantity)).toEqual([5, 5]);
		expect(position.minimumQuantity).toBe(-5);
		expect(position.wentNegative).toBe(true);
	});
});
