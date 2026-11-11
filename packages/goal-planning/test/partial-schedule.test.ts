import { describe, expect, it } from "vitest";
import {
	GoalCashInputError,
	METHODOLOGY_VERSION,
	planGoalCash,
	replayGoalCash,
} from "../src/index.js";
import type {
	CashGoal,
	GoalCashRequest,
	GoalCashResult,
} from "../src/index.js";
import { request } from "./fixtures.js";

const cents = (value: number) => Math.round(value * 100);

/** The fixture's complete goal plus a second goal varied per case. */
function twoGoals(second: Partial<CashGoal>): GoalCashRequest {
	const input = request();
	input.goals.push({
		id: "other",
		deadline: "2027-01-01",
		monthlyContribution: 300,
		targetAmount: 2000,
		startingCapital: null,
		...second,
	});
	return input;
}

function scheduledGoalIds(result: GoalCashResult): string[] {
	return [
		...new Set(
			result.rows.flatMap((row) => row.allocations.map((a) => a.goalId)),
		),
	];
}

describe("a goal that lacks what the schedule needs is left out and named", () => {
	it.each([
		["no deadline", { deadline: null }, "deadline_missing"],
		[
			"no monthly contribution",
			{ monthlyContribution: null },
			"contribution_missing",
		],
		[
			"requests beyond the supported range",
			{ monthlyContribution: 1_000_000_000 },
			"amounts_exceed_supported_range",
		],
	] as const)("schedules the complete goal beside a goal with %s", (_label, second, reason) => {
		const result = planGoalCash(twoGoals(second));
		expect(result.status).toBe("incomplete");
		expect(result.reasonCodes[0]).toBe("partial_schedule_goals_left_out");
		expect(result.reasonCodes).not.toContain("goal_commitment_missing");
		expect(result.reasonCodes).not.toContain("amounts_exceed_supported_range");
		expect(result.rows).toHaveLength(12);
		expect(result.goals[0]).toMatchObject({
			goalId: "goal",
			requestedTotal: 6000,
			fundedTotal: 6000,
			targetGap: 4000,
		});
		expect(result.goals[1]).toMatchObject({
			goalId: "other",
			requestedTotal: null,
			fundedTotal: null,
			noGrowthOutcome: null,
			targetGap: null,
		});
		expect(result.goals[1]?.reasonCodes).toContain(reason);
		expect(result.leftOutGoals).toEqual([
			{ goalId: "other", reasonCodes: [reason] },
		]);
		expect(scheduledGoalIds(result)).toEqual(["goal"]);
	});

	it("keeps a constrained cash schedule visible within a partial schedule", () => {
		const input = twoGoals({ deadline: null });
		input.goals.push({ ...input.goals[0]!, id: "third" });
		input.monthlyCapacity = 500;
		const result = planGoalCash(input);
		expect(result.status).toBe("incomplete");
		expect(result.reasonCodes).toEqual([
			"partial_schedule_goals_left_out",
			"partial_schedule_constrained",
		]);
		expect(
			result.goals
				.filter((goal) => goal.fundedTotal !== null)
				.map((goal) => goal.fundedTotal),
		).toEqual([2500, 2500]);
		expect(result.leftOutGoals?.map((goal) => goal.goalId)).toEqual(["other"]);
	});

	it("conserves every cent of a partial ledger", () => {
		const input = twoGoals({ monthlyContribution: null });
		input.liquidityNeeds = [
			{ id: "bill", dueDate: "2026-03-10", amount: 1500 },
		];
		const result = planGoalCash(input);
		expect(result.rows.length).toBeGreaterThan(0);
		let previous = cents(input.unallocatedCash ?? 0);
		for (const row of result.rows) {
			const funded = row.allocations.reduce(
				(sum, allocation) => sum + cents(allocation.funded),
				0,
			);
			expect(cents(row.cash)).toBe(
				previous +
					cents(row.netCapacity) +
					cents(row.obligationsShortfall) -
					cents(row.liquidityPaid) -
					funded,
			);
			previous = cents(row.cash);
		}
	});

	it("still names a left-out goal when a missing declaration withholds the whole ledger", () => {
		const input = twoGoals({ deadline: null });
		input.unallocatedCash = null;
		const result = planGoalCash(input);
		expect(result).toMatchObject({ status: "incomplete", rows: [] });
		expect(result.reasonCodes).toEqual(["unallocated_cash_missing"]);
		expect(result.leftOutGoals).toEqual([
			{ goalId: "other", reasonCodes: ["deadline_missing"] },
		]);
	});

	it("does not extend the timeline for a left-out goal's later deadline", () => {
		const input = twoGoals({
			deadline: "2030-01-01",
			monthlyContribution: null,
		});
		input.liquidityNeeds = [];
		expect(planGoalCash(input).rows).toHaveLength(12);
	});

	it("reports no left-out goals when every goal is scheduled", () => {
		const result = planGoalCash(request());
		expect(result.status).toBe("feasible");
		expect(Object.hasOwn(result, "leftOutGoals")).toBe(false);
	});
});

describe("a goal without a future savings date has its own state and is never counted as funded", () => {
	it.each([
		["passed", "2025-10-01", "deadline_passed"],
		[
			"on the observation day",
			"2026-01-01",
			"deadline_before_first_savings_date",
		],
		[
			"before the first savings date",
			"2026-01-31",
			"deadline_before_first_savings_date",
		],
	] as const)("leaves a goal whose deadline is %s out of the funded schedule", (_label, deadline, reason) => {
		const result = planGoalCash(twoGoals({ deadline }));
		expect(result.status).toBe("incomplete");
		expect(result.reasonCodes[0]).toBe("partial_schedule_goals_left_out");
		expect(result.goals[1]).toMatchObject({
			goalId: "other",
			horizonMonths: 0,
			requestedTotal: null,
			fundedTotal: null,
			noGrowthOutcome: null,
			targetGap: null,
		});
		expect(result.goals[1]?.reasonCodes).toContain(reason);
		expect(result.leftOutGoals).toEqual([
			{ goalId: "other", reasonCodes: [reason] },
		]);
		expect(result.goals[0]?.fundedTotal).toBe(6000);
	});

	it("does not call a plan whose only goal has passed funded", () => {
		const input = request({ liquidityNeeds: [] });
		input.goals[0]!.deadline = "2025-06-30";
		const result = planGoalCash(input);
		expect(result).toMatchObject({
			status: "incomplete",
			reasonCodes: ["partial_schedule_goals_left_out"],
			rows: [],
		});
		expect(result.goals[0]).toMatchObject({
			fundedTotal: null,
			requestedTotal: null,
			targetGap: null,
		});
		expect(result.goals[0]?.reasonCodes).toContain("deadline_passed");
	});

	it("replays a passed deadline from its saved snapshot", () => {
		const result = planGoalCash(twoGoals({ deadline: "2025-10-01" }));
		expect(result.snapshot.methodologyVersion).toBe(METHODOLOGY_VERSION);
		expect(replayGoalCash(JSON.parse(JSON.stringify(result.snapshot)))).toEqual(
			result,
		);
	});
});

describe("saved goal-cash-schedule-v1 snapshots replay as they were saved", () => {
	const v1 = (input: GoalCashRequest) => ({
		methodologyVersion: "goal-cash-schedule-v1",
		request: input,
	});

	it("withholds the whole ledger for an unknown goal commitment", () => {
		const input = twoGoals({ deadline: null });
		expect(replayGoalCash(v1(input))).toEqual({
			status: "incomplete",
			reportingCurrency: "EUR",
			snapshot: v1(input),
			reasonCodes: ["goal_commitment_missing"],
			rows: [],
			goals: [
				{
					goalId: "goal",
					horizonMonths: 12,
					currentCapital: 0,
					requestedTotal: 6000,
					fundedTotal: null,
					noGrowthOutcome: null,
					targetGap: null,
					reasonCodes: [],
				},
				{
					goalId: "other",
					horizonMonths: null,
					currentCapital: null,
					requestedTotal: null,
					fundedTotal: null,
					noGrowthOutcome: null,
					targetGap: null,
					reasonCodes: ["deadline_missing", "starting_capital_missing"],
				},
			],
		});
	});

	it("keeps a deadline before the first savings date as a zero-month goal", () => {
		const input = request({ liquidityNeeds: [] });
		input.goals[0]!.deadline = "2026-01-20";
		expect(replayGoalCash(v1(input))).toEqual({
			status: "feasible",
			reportingCurrency: "EUR",
			snapshot: v1(input),
			reasonCodes: [],
			rows: [],
			goals: [
				{
					goalId: "goal",
					horizonMonths: 0,
					currentCapital: 0,
					requestedTotal: 0,
					fundedTotal: 0,
					noGrowthOutcome: 0,
					targetGap: 10000,
					reasonCodes: [],
				},
			],
		});
	});

	it("keeps refusing a passed deadline that version 1 never admitted", () => {
		const input = request();
		input.goals[0]!.deadline = "2025-10-01";
		expect(() => replayGoalCash(v1(input))).toThrow(GoalCashInputError);
	});

	it("reproduces a version 1 feasible schedule unchanged", () => {
		const current = planGoalCash(request());
		const legacy = replayGoalCash(v1(request()));
		expect(legacy.snapshot.methodologyVersion).toBe("goal-cash-schedule-v1");
		expect({ ...legacy, snapshot: current.snapshot }).toEqual(current);
	});
});
