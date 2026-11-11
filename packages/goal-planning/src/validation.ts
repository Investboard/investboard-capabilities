import type { GoalCashRequest, GoalCashSnapshot } from "./types.js";
import { LIMITS } from "./limits.js";
import { savingsDate } from "./internal/dates.js";
import {
	array,
	date,
	money,
	requireInput,
	requireJson,
	shape,
	text,
} from "./internal/input-guards.js";

function uniqueId(value: unknown, ids: Set<string>): void {
	text(value);
	requireInput(
		!ids.has(value),
		"IDs must be unique within each input collection",
	);
	ids.add(value);
}

export function validateRequest(
	input: unknown,
	version: GoalCashSnapshot["methodologyVersion"] = "goal-cash-schedule-v2",
): asserts input is GoalCashRequest {
	requireJson(input);
	shape(
		input,
		[
			"reportingCurrency",
			"asOfDate",
			"unallocatedCash",
			"reserveFloor",
			"monthlyCapacity",
			"obligationsComplete",
			"paymentsTreatment",
			"recurringPayments",
			"liquidityNeeds",
			"goals",
		],
		"Request",
	);
	requireInput(
		input.reportingCurrency === "EUR" || input.reportingCurrency === "USD",
		"Reporting currency must be EUR or USD",
	);
	date(input.asOfDate);
	requireInput(
		input.asOfDate <= "9949-12-31",
		"Observation date must allow a 50-year calendar horizon",
	);
	const lastDay = savingsDate(input.asOfDate, LIMITS.months);
	for (const key of [
		"unallocatedCash",
		"reserveFloor",
		"monthlyCapacity",
	] as const) {
		if (input[key] !== null) money(input[key], key === "monthlyCapacity");
	}
	requireInput(
		typeof input.obligationsComplete === "boolean",
		"Obligation completeness must be explicit",
	);
	requireInput(
		input.paymentsTreatment === "already_netted" ||
			input.paymentsTreatment === "subtract_recorded" ||
			input.paymentsTreatment === "unknown",
		"Payment treatment must be explicit",
	);
	array(input.recurringPayments, LIMITS.recurringPayments);
	array(input.liquidityNeeds, LIMITS.liquidityNeeds);
	array(input.goals, LIMITS.goals);
	const paymentIds = new Set<string>();
	for (const payment of input.recurringPayments) {
		shape(
			payment,
			["id", "monthlyAmount", "startDate", "endDate"],
			"Recurring payment",
		);
		uniqueId(payment.id, paymentIds);
		if (payment.monthlyAmount !== null) money(payment.monthlyAmount);
		if (payment.startDate !== null) date(payment.startDate);
		if (payment.endDate !== null) date(payment.endDate);
		requireInput(
			payment.startDate === null ||
				payment.endDate === null ||
				payment.startDate <= payment.endDate,
			"Recurring payment dates are inconsistent",
		);
	}
	const needIds = new Set<string>();
	for (const need of input.liquidityNeeds) {
		shape(need, ["id", "dueDate", "amount"], "Liquidity need");
		uniqueId(need.id, needIds);
		date(need.dueDate);
		requireInput(
			need.dueDate >= input.asOfDate && need.dueDate <= lastDay,
			"Liquidity need must lie within the observation date and 50-year horizon",
		);
		money(need.amount);
	}
	const goalIds = new Set<string>();
	for (const goal of input.goals) {
		shape(
			goal,
			[
				"id",
				"deadline",
				"monthlyContribution",
				"targetAmount",
				"startingCapital",
			],
			"Goal",
		);
		uniqueId(goal.id, goalIds);
		if (goal.deadline !== null) {
			date(goal.deadline);
			// A passed deadline is a goal state from version 2; version 1 refused it.
			requireInput(
				(version !== "goal-cash-schedule-v1" ||
					goal.deadline >= input.asOfDate) &&
					goal.deadline <= lastDay,
				"Goal deadline must lie within the 50-year horizon",
			);
		}
		if (goal.monthlyContribution !== null) money(goal.monthlyContribution);
		if (goal.targetAmount !== null) money(goal.targetAmount);
		if (goal.startingCapital !== null) {
			const capital = goal.startingCapital;
			shape(capital, ["amount", "asOfDate", "sourceIds"], "Starting capital");
			money(capital.amount);
			date(capital.asOfDate);
			requireInput(
				capital.asOfDate <= input.asOfDate,
				"Starting capital cannot be valued in the future",
			);
			array(capital.sourceIds, 100);
			const sourceIds = new Set<string>();
			for (const id of capital.sourceIds) uniqueId(id, sourceIds);
			requireInput(
				capital.amount === 0 || sourceIds.size > 0,
				"Positive capital requires caller-supplied source identities",
			);
		}
	}
}
