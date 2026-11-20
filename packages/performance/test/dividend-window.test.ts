import { describe, expect, it } from "vitest";
import {
	evaluatePerformance,
	replayPerformance,
	type PerformanceRequest,
} from "../src/index.js";
import { calculation, position, request } from "./public-fixtures.js";

const dates = Array.from({ length: 9 }, (_, i) => `2026-10-${16 + i}`);
const opening = "2026-10-10";
const dividend = {
	id: "distribution",
	holdingId: "payer",
	date: "2026-10-20",
	type: "dividend",
	amount: 10,
} as const;

// Three flat synthetic holdings worth 40, 30 and 30, purchased before the window.
function window(from: string, to: string): PerformanceRequest {
	const positions = ["payer", "second", "third"].map((id, index) =>
		position({
			id,
			currentQuantity: 1,
			anchorDate: opening,
			prices: dates.map((date) => ({ date, value: index === 0 ? 40 : 30 })),
		}),
	);
	return request({
		asOfDate: "2026-10-24",
		snapshots: dates
			.filter((date) => date >= from && date <= to)
			.map((date) => ({ date, value: 100 })),
		positions,
		effects: positions.map(({ id }) => ({
			id: `purchase-${id}`,
			date: opening,
			type: "buy",
			holdingId: id,
			quantity: 1,
		})),
		cashFlows: [dividend],
	});
}

describe("close-to-close distributed income", () => {
	it.each([
		["2026-10-16", "2026-10-20", 10],
		["2026-10-20", "2026-10-24", 0],
		["2026-10-16", "2026-10-24", 10],
	] as const)("from %s to %s attributes €%d once", (from, to, income) => {
		const whole = window(from, to);
		for (const [input, nav] of [
			[whole, 100],
			[{ ...whole, scopeHoldingIds: ["payer"] }, 40],
		] as const) {
			const c = calculation(input);
			expect(c.wealthBridge).toMatchObject({
				openingWealth: nav,
				closingWealth: nav,
				distributedIncome: income,
				investmentResult: income,
				localPrice: 0,
				quoteFx: 0,
				reconciliationGap: 0,
				unvaluedIntervalCount: 0,
			});
			expect(c.timeWeightedReturn.twr).toBeCloseTo(income / nav, 12);
			const payer = c.attribution.holdings.find((h) => h.id === "payer");
			expect(payer?.contribution).toBeCloseTo(income / nav, 12);
			expect(c.attribution.residualContribution).toBeCloseTo(0, 12);
		}
	});

	it("does not refuse a selected basket for unassigned withholding tax on its opening dividend", () => {
		const before = window("2026-10-16", "2026-10-20");
		const after = window("2026-10-20", "2026-10-24");
		const cost = { date: dividend.date, holdingId: null, fees: 0, taxes: 2 };
		const scoped = { scopeHoldingIds: ["payer"], recordedCosts: [cost] };
		expect(evaluatePerformance({ ...before, ...scoped }).reasonCodes).toContain(
			"scope_history_missing",
		);
		expect(calculation({ ...after, ...scoped }).wealthBridge).toMatchObject({
			distributedIncome: 0,
			recordedTaxes: 0,
		});
		expect(
			calculation({ ...before, recordedCosts: [cost] }).wealthBridge,
		).toMatchObject({ distributedIncome: 10, recordedTaxes: 2 });
		const legacy = replayPerformance({
			methodologyVersion: "actual-position-performance-v4",
			request: { ...after, ...scoped },
		});
		expect(legacy.reasonCodes).toContain("scope_history_missing");
	});

	it("includes only closing-date income in the 365-day money-weighted return", () => {
		const input = request({
			asOfDate: "2026-10-20",
			positions: [],
			effects: [],
			snapshots: [
				{ date: "2025-10-20", value: 100 },
				{ date: "2026-10-20", value: 100 },
			],
			cashFlows: [
				{ ...dividend, holdingId: null },
				{
					...dividend,
					holdingId: null,
					id: "opening",
					date: "2025-10-20",
					amount: 20,
				},
			],
		});
		expect(calculation(input).moneyWeightedReturn.mwr).toBeCloseTo(0.1, 8);
		for (const methodologyVersion of [
			"actual-position-performance-v3",
			"actual-position-performance-v4",
		] as const) {
			const saved = { methodologyVersion, request: input };
			expect(
				replayPerformance(saved).calculation?.moneyWeightedReturn.mwr,
			).toBeCloseTo(110 / 80 - 1, 8);
		}
	});

	it("retains opening income in the saved ledger and replays the pinned rule", () => {
		const input = window("2026-10-20", "2026-10-24");
		const current = evaluatePerformance(input);
		expect(current.snapshot.methodologyVersion).toBe(
			"actual-position-performance-v5",
		);
		expect(current.snapshot.request.cashFlows).toEqual([dividend]);
		expect(
			replayPerformance(JSON.parse(JSON.stringify(current.snapshot))),
		).toEqual(current);
		for (const methodologyVersion of [
			"actual-position-performance-v3",
			"actual-position-performance-v4",
		] as const) {
			const saved = { methodologyVersion, request: input };
			const legacy = replayPerformance(saved);
			expect(legacy.snapshot).toEqual(saved);
			expect(legacy.calculation?.wealthBridge.distributedIncome).toBe(10);
			expect(legacy.calculation?.timeWeightedReturn.twr).toBeCloseTo(0.1, 12);
			expect(
				legacy.calculation?.attribution.holdings.find((h) => h.id === "payer")
					?.contribution,
			).toBeCloseTo(0.1, 12);
		}
	});

	it("requires a scope assignment only when the distribution is inside the window", () => {
		const unknownPayer = {
			...window("2026-10-20", "2026-10-24"),
			cashFlows: [{ ...dividend, holdingId: null }],
			scopeHoldingIds: ["payer"],
		};
		expect(calculation(unknownPayer).timeWeightedReturn.twr).toBe(0);
		const inside = {
			...unknownPayer,
			cashFlows: [{ ...dividend, holdingId: null, date: "2026-10-24" }],
		};
		expect(evaluatePerformance(inside).reasonCodes).toEqual([
			"scope_history_missing",
		]);
	});
});
