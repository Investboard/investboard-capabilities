import { describe, expect, it } from "vitest";
import { planGoalCash } from "../src/index.js";
import { request } from "./fixtures.js";

describe("deadline-aware public cash schedule", () => {
	it("funds the feasible distant-payment schedule without reserving face value upfront", () => {
		const result = planGoalCash(request());
		expect(result.status).toBe("feasible");
		expect(result.rows).toHaveLength(12);
		expect(result.goals[0]).toMatchObject({
			requestedTotal: 6000,
			fundedTotal: 6000,
			noGrowthOutcome: 6000,
			targetGap: 4000,
		});
		expect(result.rows[0]).toMatchObject({
			cash: 1500,
			futureCommitmentReserve: 0,
			availableCash: 500,
		});
		expect(result.rows.at(-1)?.cash).toBe(6000);
		expect(result.rows.reduce((sum, row) => sum + row.liquidityPaid, 0)).toBe(
			1000,
		);
		expect(
			result.rows.every(
				(row) => row.cash >= 1000 && row.liquidityShortfall === 0,
			),
		).toBe(true);
	});

	it("reserves the genuinely necessary buffer for an earlier expense", () => {
		const result = planGoalCash(
			request({
				liquidityNeeds: [{ id: "early", dueDate: "2026-03-01", amount: 1000 }],
			}),
		);
		expect(result.status).toBe("constrained");
		expect(result.rows[0]).toMatchObject({
			cash: 2000,
			futureCommitmentReserve: 1000,
			availableCash: 0,
		});
		expect(result.rows[0]?.allocations[0]?.funded).toBe(0);
		expect(result.goals[0]?.fundedTotal).toBe(5500);
		expect(result.rows.every((row) => row.liquidityShortfall === 0)).toBe(true);
	});

	it("records a missed due time even if later same-day savings settle the payment", () => {
		const result = planGoalCash(
			request({
				liquidityNeeds: [{ id: "early", dueDate: "2026-02-01", amount: 1000 }],
			}),
		);
		expect(result.status).toBe("constrained");
		expect(result.rows[0]).toMatchObject({
			liquidityShortfall: 1000,
			liquidityPaid: 1000,
			overduePayments: 0,
			cash: 1000,
		});
	});

	it("does not borrow a later receipt for a payment between savings events", () => {
		const result = planGoalCash(
			request({
				liquidityNeeds: [{ id: "early", dueDate: "2026-01-15", amount: 1000 }],
			}),
		);
		expect(result.rows[0]).toMatchObject({
			date: "2026-01-15",
			month: null,
			netCapacity: 0,
			liquidityPaid: 0,
			liquidityShortfall: 1000,
			overduePayments: 1000,
		});
		expect(result.rows[1]).toMatchObject({
			date: "2026-02-01",
			liquidityPaid: 1000,
			overduePayments: 0,
		});
	});

	it("shares each receipt once across competing goals", () => {
		const input = request();
		input.goals.push({ ...input.goals[0]!, id: "second" });
		input.liquidityNeeds[0]!.dueDate = "2026-03-01";
		const result = planGoalCash(input);
		expect(result.goals.map((goal) => goal.fundedTotal)).toEqual([5500, 5500]);
		expect(result.rows.at(-1)?.cash).toBe(1000);
	});

	it("uses capacity after an early goal deadline without extending goal funding", () => {
		const input = request();
		input.goals[0]!.deadline = "2026-03-01";
		const result = planGoalCash(input);
		expect(result.status).toBe("feasible");
		expect(result.goals[0]).toMatchObject({
			horizonMonths: 2,
			fundedTotal: 1000,
		});
		expect(
			result.rows.slice(2).every((row) => row.allocations.length === 0),
		).toBe(true);
	});

	it("models future recurring deficits only within inclusive payment dates", () => {
		const input = request({
			unallocatedCash: 4000,
			liquidityNeeds: [],
			paymentsTreatment: "subtract_recorded",
			recurringPayments: [
				{
					id: "loan",
					monthlyAmount: 2000,
					startDate: "2026-03-01",
					endDate: "2026-04-01",
				},
			],
		});
		const result = planGoalCash(input);
		expect(result.status).toBe("feasible");
		expect(result.rows.slice(0, 4).map((row) => row.netCapacity)).toEqual([
			1000, -1000, -1000, 1000,
		]);
		expect(result.rows[0]?.futureCommitmentReserve).toBe(2000);
		expect(result.goals[0]?.fundedTotal).toBe(6000);
	});

	it("never subtracts already-netted payments again", () => {
		const result = planGoalCash(
			request({
				recurringPayments: [
					{ id: "loan", monthlyAmount: 2000, startDate: null, endDate: null },
				],
			}),
		);
		expect(result.status).toBe("feasible");
		expect(result.rows.every((row) => row.netCapacity === 1000)).toBe(true);
	});

	it("funds a recurring living deficit from declared cash and preserves its future buffer", () => {
		const input = request({
			unallocatedCash: 3000,
			monthlyCapacity: -100,
			liquidityNeeds: [],
		});
		input.goals[0]!.monthlyContribution = 50;
		const result = planGoalCash(input);
		expect(result.status).toBe("feasible");
		expect(result.rows[0]).toMatchObject({
			netCapacity: -100,
			futureCommitmentReserve: 1100,
		});
		expect(result.goals[0]?.fundedTotal).toBe(600);
		expect(result.rows.at(-1)?.cash).toBe(1200);
	});

	it("keeps unpaid mandatory deficits explicit instead of creating negative cash", () => {
		const result = planGoalCash(
			request({
				unallocatedCash: 0,
				reserveFloor: 0,
				monthlyCapacity: -100,
				liquidityNeeds: [],
			}),
		);
		expect(result.status).toBe("constrained");
		expect(result.rows[0]).toMatchObject({
			cash: 0,
			obligationsShortfall: 100,
			overduePayments: 100,
		});
		expect(result.rows.at(-1)?.overduePayments).toBe(1200);
	});

	it("flags an initially underfunded floor", () => {
		const result = planGoalCash(request({ unallocatedCash: 500 }));
		expect(result.status).toBe("constrained");
		expect(result.reasonCodes).toContain("reserve_underfunded");
	});

	it("clamps each anniversary from the original day and admits no partial month", () => {
		const input = request({ asOfDate: "2028-01-31", liquidityNeeds: [] });
		input.goals[0]!.deadline = "2028-03-30";
		input.goals[0]!.startingCapital = null;
		const result = planGoalCash(input);
		expect(result.rows.map((row) => row.date)).toEqual(["2028-02-29"]);
		expect(result.goals[0]).toMatchObject({
			horizonMonths: 1,
			requestedTotal: 500,
			fundedTotal: 500,
		});
		input.goals[0]!.deadline = "2028-03-31";
		expect(planGoalCash(input).rows.map((row) => row.date)).toEqual([
			"2028-02-29",
			"2028-03-31",
		]);
	});

	it("has no contribution on the observation day", () => {
		const input = request({ liquidityNeeds: [] });
		input.goals[0]!.deadline = input.asOfDate;
		const result = planGoalCash(input);
		expect(result.rows).toEqual([]);
		expect(result.goals[0]).toMatchObject({
			requestedTotal: 0,
			fundedTotal: 0,
			noGrowthOutcome: 0,
			targetGap: 10000,
		});
	});

	it("pays an observation-day need only from the opening cash", () => {
		const input = request({
			unallocatedCash: 2000,
			liquidityNeeds: [{ id: "now", dueDate: "2026-01-01", amount: 1000 }],
		});
		const result = planGoalCash(input);
		expect(result.status).toBe("feasible");
		expect(result.rows[0]).toMatchObject({
			date: "2026-01-01",
			month: null,
			cash: 1000,
			netCapacity: 0,
			liquidityPaid: 1000,
		});
		expect(result.rows[0]?.allocations).toEqual([]);
	});

	it("admits the 600-month boundary without creating an extra receipt", () => {
		const input = request({
			monthlyCapacity: 1,
			reserveFloor: 0,
			unallocatedCash: 0,
			liquidityNeeds: [],
		});
		input.goals[0]!.deadline = "2076-01-01";
		input.goals[0]!.monthlyContribution = 1;
		const result = planGoalCash(input);
		expect(result.rows).toHaveLength(600);
		expect(result.goals[0]).toMatchObject({
			horizonMonths: 600,
			requestedTotal: 600,
			fundedTotal: 600,
		});
	});

	it("breaks spare-cent ties by identity independently of input order", () => {
		const input = request({
			unallocatedCash: 0,
			reserveFloor: 0,
			monthlyCapacity: 0.01,
			liquidityNeeds: [],
		});
		input.goals = ["b", "a"].map((id) => ({
			id,
			deadline: "2026-02-01",
			monthlyContribution: 0.01,
			targetAmount: null,
			startingCapital: null,
		}));
		const result = planGoalCash(input);
		expect(result.rows[0]?.allocations).toEqual([
			{ goalId: "a", requested: 0.01, funded: 0.01 },
			{ goalId: "b", requested: 0.01, funded: 0 },
		]);
		input.goals.reverse();
		expect(planGoalCash(input).rows).toEqual(result.rows);
	});

	it("does not spend goal capital or double-count overlapping capital sources", () => {
		const input = request({ monthlyCapacity: 0, liquidityNeeds: [] });
		input.goals[0]!.startingCapital = {
			amount: 10000,
			asOfDate: input.asOfDate,
			sourceIds: ["portfolio"],
		};
		input.goals.push({ ...input.goals[0]!, id: "second" });
		const result = planGoalCash(input);
		expect(result.status).toBe("constrained");
		expect(
			result.goals.every(
				(goal) => goal.fundedTotal === 0 && goal.noGrowthOutcome === null,
			),
		).toBe(true);
		expect(result.goals[0]?.reasonCodes).toContain(
			"starting_capital_shared_by_goals",
		);
	});

	it("withholds a stale no-growth outcome while keeping known cash funding", () => {
		const input = request();
		input.goals[0]!.startingCapital = {
			amount: 500,
			asOfDate: "2025-12-31",
			sourceIds: ["portfolio"],
		};
		const result = planGoalCash(input);
		expect(result.status).toBe("feasible");
		expect(result.goals[0]).toMatchObject({
			fundedTotal: 6000,
			currentCapital: null,
			noGrowthOutcome: null,
			targetGap: null,
		});
		expect(result.goals[0]?.reasonCodes).toContain(
			"starting_capital_not_current",
		);
	});

	it("preserves ledger conservation across arrears, recurring deficits and goals", () => {
		const input = request({
			unallocatedCash: 1200,
			monthlyCapacity: 300,
			paymentsTreatment: "subtract_recorded",
			recurringPayments: [
				{
					id: "loan",
					monthlyAmount: 700,
					startDate: "2026-03-01",
					endDate: "2026-05-01",
				},
			],
			liquidityNeeds: [{ id: "expense", dueDate: "2026-01-15", amount: 800 }],
		});
		const result = planGoalCash(input);
		let cash = 120000;
		for (const row of result.rows) {
			const cents = (value: number) => Math.round(value * 100);
			const goalFunding = row.allocations.reduce(
				(sum, allocation) => sum + cents(allocation.funded),
				0,
			);
			expect(cents(row.cash)).toBe(
				cash +
					cents(row.netCapacity) +
					cents(row.obligationsShortfall) -
					cents(row.liquidityPaid) -
					goalFunding,
			);
			expect(row.availableCash).toBe(
				Math.max(
					0,
					cents(row.cash) -
						100000 -
						cents(row.futureCommitmentReserve) -
						cents(row.overduePayments),
				) / 100,
			);
			cash = cents(row.cash);
		}
	});

	it.each([
		2, 4, 8, 12,
	])("keeps every affordable request when the expense arrives in month %i", (month) => {
		const input = request({ unallocatedCash: 2000 });
		input.liquidityNeeds[0]!.dueDate =
			month === 12
				? "2027-01-01"
				: `2026-${String(month + 1).padStart(2, "0")}-01`;
		const result = planGoalCash(input);
		expect(result.status).toBe("feasible");
		expect(result.goals[0]?.fundedTotal).toBe(6000);
	});
});
