import { describe, expect, it } from "vitest";
import {
	GoalCashInputError,
	METHODOLOGY_VERSION,
	planGoalCash,
	replayGoalCash,
} from "../src/index.js";
import type { GoalCashRequest } from "../src/index.js";
import { request } from "./fixtures.js";

describe("cash evidence and public input boundary", () => {
	it.each([
		["unallocatedCash", "unallocated_cash_missing"],
		["reserveFloor", "reserve_floor_missing"],
		["monthlyCapacity", "monthly_capacity_missing"],
	] as const)("preserves unknown %s instead of treating it as zero", (field, reason) => {
		const input = request();
		input[field] = null;
		const result = planGoalCash(input);
		expect(result.status).toBe("incomplete");
		expect(result.rows).toEqual([]);
		expect(result.goals[0]?.fundedTotal).toBeNull();
		expect(result.reasonCodes).toContain(reason);
	});

	it("requires complete obligations and an explicit netting decision", () => {
		const result = planGoalCash(
			request({ obligationsComplete: false, paymentsTreatment: "unknown" }),
		);
		expect(result.status).toBe("incomplete");
		expect(result.reasonCodes).toEqual([
			"obligations_not_confirmed_complete",
			"payment_netting_unknown",
		]);
	});

	it.each([
		"deadline",
		"monthlyContribution",
	] as const)("replays a version 1 ledger withheld for an unknown goal %s", (field) => {
		const input = request();
		input.goals[0]![field] = null;
		const result = replayGoalCash({
			methodologyVersion: "goal-cash-schedule-v1",
			request: input,
		});
		expect(result.status).toBe("incomplete");
		expect(result.rows).toEqual([]);
		expect(result.reasonCodes).toContain("goal_commitment_missing");
		expect(planGoalCash(input).reasonCodes).toEqual([
			"partial_schedule_goals_left_out",
		]);
	});

	it("admits a known zero goal contribution", () => {
		const input = request();
		input.goals[0]!.monthlyContribution = 0;
		expect(planGoalCash(input).goals[0]?.fundedTotal).toBe(0);
	});

	it("only requires missing recurring amounts inside the modeled interval", () => {
		const input = request({
			paymentsTreatment: "subtract_recorded",
			recurringPayments: [
				{
					id: "future",
					monthlyAmount: null,
					startDate: "2028-01-01",
					endDate: null,
				},
			],
		});
		expect(planGoalCash(input).status).toBe("feasible");
		input.recurringPayments[0]!.startDate = "2026-02-01";
		expect(planGoalCash(input).reasonCodes).toContain(
			"recurring_payment_missing",
		);
	});

	it("does not require a redundant payment amount when capacity is already net", () => {
		const result = planGoalCash(
			request({
				recurringPayments: [
					{ id: "loan", monthlyAmount: null, startDate: null, endDate: null },
				],
			}),
		);
		expect(result.status).toBe("feasible");
	});

	it.each([
		0.291,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		-1,
		1_000_000_000.01,
	])("rejects invalid declared cash %s", (unallocatedCash) => {
		expect(() => planGoalCash(request({ unallocatedCash }))).toThrow(
			GoalCashInputError,
		);
	});

	it("admits ordinary exact-cent values and a signed capacity", () => {
		const result = planGoalCash(
			request({
				unallocatedCash: 0.29,
				reserveFloor: 0,
				monthlyCapacity: -0.01,
				goals: [],
				liquidityNeeds: [],
			}),
		);
		expect(result.status).toBe("feasible");
	});

	it("rejects inconsistent recurring dates instead of implying no payment", () => {
		expect(() =>
			planGoalCash(
				request({
					recurringPayments: [
						{
							id: "loan",
							monthlyAmount: 10,
							startDate: "2027-01-01",
							endDate: "2026-01-01",
						},
					],
				}),
			),
		).toThrow(GoalCashInputError);
	});

	it.each([
		"2026-02-30",
		"2025-12-31",
		"2076-01-02",
	])("rejects an invalid or out-of-window due date %s", (dueDate) => {
		expect(() =>
			planGoalCash(
				request({ liquidityNeeds: [{ id: "expense", dueDate, amount: 1000 }] }),
			),
		).toThrow(GoalCashInputError);
	});

	it("rejects duplicate goal identities", () => {
		const input = request();
		input.goals.push({ ...input.goals[0]! });
		expect(() => planGoalCash(input)).toThrow(GoalCashInputError);
	});

	it("rejects fractional cents in capacity and goal requests too", () => {
		expect(() => planGoalCash(request({ monthlyCapacity: -0.291 }))).toThrow(
			GoalCashInputError,
		);
		const input = request();
		input.goals[0]!.monthlyContribution = 0.291;
		expect(() => planGoalCash(input)).toThrow(GoalCashInputError);
	});

	it("withholds aggregate amounts beyond the supported range", () => {
		const result = planGoalCash(request({ monthlyCapacity: 1_000_000_000 }));
		expect(result.status).toBe("incomplete");
		expect(result.reasonCodes).toContain("amounts_exceed_supported_range");
		expect(result.rows).toEqual([]);
	});

	it("supports USD without currency conversion or EUR assumptions", () => {
		const result = planGoalCash(request({ reportingCurrency: "USD" }));
		expect(result.reportingCurrency).toBe("USD");
		expect(result.goals[0]?.fundedTotal).toBe(6000);
	});

	it("replays plain JSON and isolates request, result and replay mutations", () => {
		const input = request();
		const result = planGoalCash(input);
		const serialized = JSON.stringify(result.snapshot);
		expect(result.snapshot.methodologyVersion).toBe(METHODOLOGY_VERSION);
		expect(replayGoalCash(JSON.parse(serialized))).toEqual(result);
		input.goals[0]!.monthlyContribution = 0;
		result.snapshot.request.liquidityNeeds[0]!.amount = 0;
		expect(replayGoalCash(JSON.parse(serialized)).goals[0]?.fundedTotal).toBe(
			6000,
		);
		const snapshot = JSON.parse(serialized);
		const replayed = replayGoalCash(snapshot);
		replayed.snapshot.request.goals[0]!.monthlyContribution = 0;
		expect(snapshot.request.goals[0].monthlyContribution).toBe(500);
	});

	it("rejects unsupported snapshot versions and fields", () => {
		const snapshot = planGoalCash(request()).snapshot;
		expect(() =>
			replayGoalCash({ ...snapshot, methodologyVersion: "future" }),
		).toThrow(GoalCashInputError);
		expect(() => replayGoalCash({ ...snapshot, trusted: true })).toThrow(
			GoalCashInputError,
		);
	});

	it("rejects accessors without invoking them", () => {
		let called = false;
		const input = request();
		Object.defineProperty(input, "unallocatedCash", {
			enumerable: true,
			get() {
				called = true;
				return 1000;
			},
		});
		expect(() => planGoalCash(input)).toThrow(GoalCashInputError);
		expect(called).toBe(false);
	});

	it("rejects lossy/non-JSON inputs before calculation", () => {
		const invalid: unknown[] = [
			{ ...request(), extra: true },
			{ ...request(), reserveFloor: undefined },
			{ ...request(), asOfDate: new Date("2026-01-01") },
			{ ...request(), goals: new Array(1) },
			{ ...request(), [Symbol("hidden")]: 1 },
		];
		const cyclic = request() as GoalCashRequest & { cycle?: unknown };
		cyclic.cycle = cyclic;
		invalid.push(cyclic);
		for (const input of invalid)
			expect(() => planGoalCash(input as GoalCashRequest)).toThrow(
				GoalCashInputError,
			);
	});
});
