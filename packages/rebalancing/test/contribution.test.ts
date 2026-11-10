import { describe, expect, it } from "vitest";
import {
	allocateContribution,
	projectContributions,
	policy,
} from "./fixtures.js";

const positions = [
	{ assetClass: "equities", value: 70000 },
	{ assetClass: "bonds", value: 30000 },
];
const returns = { equities: 0, bonds: 0, cash: 0 };

describe("standalone contribution allocation", () => {
	it("reserves a one-cent cash gap without floating-point ceil over-reservation", () => {
		const result = allocateContribution({
			positions: [{ assetClass: "cash", value: 0.09 }],
			policy: { equities: { min: 0, target: 1, max: 1 } },
			contribution: 0.1,
			cashFloor: 0.1,
		});
		expect(result.allocations[0]?.amount).toBe(0.09);
		expect(result.retainedCash).toBe(0.01);
	});
	it("reuses the post-contribution shortfall method", () => {
		expect(
			allocateContribution({ positions, policy, contribution: 100000 }),
		).toEqual({
			existingCashReleased: 0,
			allocations: [
				{ assetClass: "bonds", amount: 50000, proportion: 0.5 },
				{ assetClass: "equities", amount: 50000, proportion: 0.5 },
			],
			retainedCash: 0,
			postContributionValue: 200000,
		});
	});
	it("keeps skipped minimums and reserve in the admitted budget", () => {
		const result = allocateContribution({
			positions,
			policy,
			contribution: 10000,
			cashFloor: 5000,
			minTradeSize: 6000,
		});
		expect(result).toEqual({
			existingCashReleased: 0,
			allocations: [],
			retainedCash: 10000,
			postContributionValue: 110000,
		});
	});
	it("reconciles tiny budgets with deterministic largest remainders", () => {
		const three = Object.fromEntries(
			["equities", "bonds", "gold"].map((k) => [
				k,
				{ min: 0, target: 1 / 3, max: 1 },
			]),
		);
		const result = allocateContribution({
			positions: [],
			policy: three,
			contribution: 0.02,
		});
		expect(result.allocations.map((a) => [a.assetClass, a.amount])).toEqual([
			["bonds", 0.01],
			["equities", 0.01],
		]);
		expect(result.retainedCash).toBe(0);
	});
	it("handles prototype-like class names as data", () => {
		const names = ["__proto__", "constructor", "toString"];
		const policy = Object.fromEntries(
			names.map((k) => [k, { min: 0, target: 1 / 3, max: 1 }]),
		);
		const result = allocateContribution({
			positions: [],
			policy,
			contribution: 0.03,
		});
		expect(result.allocations.map((a) => a.assetClass).sort()).toEqual(
			names.sort(),
		);
		expect(
			result.allocations.reduce(
				(sum, a) => sum + a.amount,
				result.retainedCash,
			),
		).toBe(0.03);
	});
	it("conserves 300 varied cent budgets after minimums, reserve and order caps", () => {
		for (let i = 1; i <= 300; i++) {
			const contribution = ((i * 7919) % 1000000) / 100;
			const result = allocateContribution({
				positions: [
					{ assetClass: "equities", value: i * 10 },
					{ assetClass: "bonds", value: i * 5 },
				],
				policy,
				contribution,
				cashFloor: i,
				minTradeSize: i % 20,
				maxTrades: i % 3,
			});
			expect(result.allocations.length).toBeLessThanOrEqual(i % 3);
			expect(
				result.allocations.every(
					(a) =>
						a.amount >= i % 20 &&
						Number.isSafeInteger(Math.round(a.amount * 100)),
				),
			).toBe(true);
			expect(
				result.allocations.reduce(
					(sum, a) => sum + Math.round(a.amount * 100),
					Math.round(result.retainedCash * 100),
				),
			).toBe(Math.round(contribution * 100));
		}
	});
});

describe("explicit recurring assumptions", () => {
	it("adapts after reaching the target instead of continuing to buy bonds", () => {
		const result = projectContributions({
			positions,
			policy,
			monthlyContribution: 10000,
			months: 12,
			annualReturns: returns,
		});
		for (const month of result.timeline.slice(1)) {
			expect(
				month.rows.find((r) => r.assetClass === "equities")?.current,
			).toBeCloseTo(0.6, 8);
			expect(
				month.rows.find((r) => r.assetClass === "bonds")?.current,
			).toBeCloseTo(0.4, 8);
		}
		expect(result.timeline[11]?.value).toBe(220000);
	});
	it("never projects a 100 purchase under a 1000 trade minimum", () => {
		const result = projectContributions({
			positions,
			policy,
			monthlyContribution: 100,
			months: 12,
			minTradeSize: 1000,
			annualReturns: returns,
		});
		for (const month of result.timeline) {
			expect(month.allocations).toEqual([]);
			expect(month.retainedCash).toBe(100);
			expect(month.positions.find((p) => p.assetClass === "bonds")?.value).toBe(
				30000,
			);
			expect(month.positions.find((p) => p.assetClass === "cash")?.value).toBe(
				month.month * 100,
			);
			expect(month.value).toBe(100000 + month.month * 100);
		}
	});
	it("applies the same order cap throughout the timeline", () => {
		const result = projectContributions({
			positions: [{ assetClass: "cash", value: 1000 }],
			policy,
			monthlyContribution: 100,
			months: 12,
			maxTrades: 1,
			annualReturns: returns,
		});
		for (const month of result.timeline) {
			expect(month.allocations).toHaveLength(1);
			expect(month.value).toBe(1000 + month.month * 100);
			expect(month.retainedCash).toBeGreaterThanOrEqual(0);
		}
	});
	it("retains reserve and cash growth under the separately supplied cash assumption", () => {
		const result = projectContributions({
			positions: [{ assetClass: "cash", value: 1000 }],
			policy,
			cashFloor: 2000,
			monthlyContribution: 100,
			months: 3,
			annualReturns: returns,
		});
		expect(
			result.timeline.map(
				(m) => m.positions.find((p) => p.assetClass === "cash")?.value,
			),
		).toEqual([1100, 1200, 1300]);
	});
	it("uses the exact supplied return assumption and no wall clock", () => {
		const input = {
			positions: [{ assetClass: "equities", value: 10000 }],
			policy: { equities: { min: 0, target: 1, max: 1 } },
			monthlyContribution: 100,
			months: 2,
			annualReturns: { equities: 1.01 ** 12 - 1, cash: 0 },
		};
		const result = projectContributions(input);
		expect(result.timeline.map((m) => m.value)).toEqual([10200, 10402]);
		expect(
			projectContributions(JSON.parse(JSON.stringify(result.request))),
		).toEqual(result);
	});
});
