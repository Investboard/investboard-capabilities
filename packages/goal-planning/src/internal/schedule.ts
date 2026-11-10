import type {
	CashScheduleRow,
	GoalCashResult,
	GoalCashSnapshot,
	PlanReason,
} from "../types.js";
import { LIMITS, fromCents, toCents } from "../limits.js";
import { allocate } from "./allocation.js";
import { fullMonths, savingsDate } from "./dates.js";
import { finishOutcomes, prepareOutcomes } from "./outcomes.js";
import {
	buildTimeline,
	futureRequirements,
	paymentIsOngoing,
} from "./timeline.js";

/** Internal entry: public boundary has admitted a defensive plain-JSON copy. */
export function calculateSchedule(snapshot: GoalCashSnapshot): GoalCashResult {
	const request = snapshot.request;
	const reasons = new Set<PlanReason>();
	if (!request.obligationsComplete)
		reasons.add("obligations_not_confirmed_complete");
	if (request.unallocatedCash === null) reasons.add("unallocated_cash_missing");
	if (request.reserveFloor === null) reasons.add("reserve_floor_missing");
	if (request.monthlyCapacity === null) reasons.add("monthly_capacity_missing");
	if (request.paymentsTreatment === "unknown")
		reasons.add("payment_netting_unknown");
	const outcomes = prepareOutcomes(request, reasons);
	const incomplete = (): GoalCashResult => ({
		status: "incomplete",
		reportingCurrency: request.reportingCurrency,
		snapshot,
		reasonCodes: [...reasons],
		rows: [],
		goals: outcomes,
	});
	if (reasons.size > 0) return incomplete();
	const lastGoalMonth = Math.max(
		0,
		...outcomes.map((goal) => goal.horizonMonths ?? 0),
	);
	const finalDay =
		[
			savingsDate(request.asOfDate, lastGoalMonth),
			...request.liquidityNeeds.map((need) => need.dueDate),
		]
			.sort()
			.at(-1) ?? request.asOfDate;
	const months = fullMonths(request.asOfDate, finalDay);
	const monthlyDates = Array.from({ length: months }, (_, i) =>
		savingsDate(request.asOfDate, i + 1),
	);
	if (
		request.paymentsTreatment === "subtract_recorded" &&
		request.recurringPayments.some(
			(payment) =>
				payment.monthlyAmount === null &&
				monthlyDates.some((date) => paymentIsOngoing(payment, date)),
		)
	) {
		reasons.add("recurring_payment_missing");
		return incomplete();
	}
	const events = buildTimeline(request, months);
	const requirements = futureRequirements(events);
	const max = LIMITS.amount * 100;
	const initialCash = toCents(request.unallocatedCash ?? 0);
	const totalReceipts = events.reduce(
		(sum, event) => sum + Math.max(0, event.netCapacityCents),
		initialCash,
	);
	const totalNeeds = events.reduce(
		(sum, event) => sum + event.liquidityDueCents,
		0,
	);
	const totalRequests = outcomes.reduce(
		(sum, goal) => sum + toCents(goal.requestedTotal ?? 0),
		0,
	);
	if (
		requirements === null ||
		totalReceipts > max ||
		totalNeeds > max ||
		totalRequests > max
	) {
		reasons.add("amounts_exceed_supported_range");
		return incomplete();
	}
	const reserve = toCents(request.reserveFloor ?? 0);
	let cash = initialCash;
	let overdue = 0;
	let constrained = cash < reserve;
	if (constrained) reasons.add("reserve_underfunded");
	const funded = new Map(outcomes.map((goal) => [goal.goalId, 0]));
	const goals = new Map(request.goals.map((goal) => [goal.id, goal]));
	const rows: CashScheduleRow[] = [];
	for (const [index, event] of events.entries()) {
		const futureRequirement = requirements[index];
		if (futureRequirement === undefined)
			throw new Error("Cash event is missing its requirement");
		// Pay dated needs first. Later same-day income may only settle them late.
		let liquidityPaid = Math.min(
			event.liquidityDueCents,
			Math.max(0, cash - reserve),
		);
		const liquidityShortfall = event.liquidityDueCents - liquidityPaid;
		cash -= liquidityPaid;
		overdue += liquidityShortfall;
		const obligationsShortfall = Math.max(0, -event.netCapacityCents - cash);
		cash = Math.max(0, cash + event.netCapacityCents);
		overdue += obligationsShortfall;
		if (cash < reserve || liquidityShortfall > 0 || obligationsShortfall > 0)
			constrained = true;
		const latePayment = Math.min(overdue, Math.max(0, cash - reserve));
		cash -= latePayment;
		overdue -= latePayment;
		liquidityPaid += latePayment;
		if (!Number.isSafeInteger(overdue) || overdue > max) {
			reasons.add("amounts_exceed_supported_range");
			return incomplete();
		}
		const requests =
			event.month === null
				? []
				: outcomes
						.filter(
							(goal) =>
								event.month !== null &&
								event.month <= (goal.horizonMonths ?? 0),
						)
						.map((goal) => ({
							goalId: goal.goalId,
							amountCents: toCents(
								goals.get(goal.goalId)?.monthlyContribution ?? 0,
							),
						}));
		const allocations = allocate(
			requests,
			Math.max(0, cash - reserve - futureRequirement - overdue),
		);
		for (const allocation of allocations) {
			cash -= allocation.fundedCents;
			funded.set(
				allocation.goalId,
				(funded.get(allocation.goalId) ?? 0) + allocation.fundedCents,
			);
			if (allocation.fundedCents < allocation.amountCents) constrained = true;
		}
		rows.push({
			date: event.date,
			month: event.month,
			cash: fromCents(cash),
			netCapacity: fromCents(event.netCapacityCents),
			liquidityPaid: fromCents(liquidityPaid),
			liquidityShortfall: fromCents(liquidityShortfall),
			obligationsShortfall: fromCents(obligationsShortfall),
			overduePayments: fromCents(overdue),
			futureCommitmentReserve: fromCents(futureRequirement),
			availableCash: fromCents(
				Math.max(0, cash - reserve - futureRequirement - overdue),
			),
			allocations: allocations.map((row) => ({
				goalId: row.goalId,
				requested: fromCents(row.amountCents),
				funded: fromCents(row.fundedCents),
			})),
		});
	}
	return {
		status: constrained ? "constrained" : "feasible",
		reportingCurrency: request.reportingCurrency,
		snapshot,
		reasonCodes: [...reasons],
		rows,
		goals: finishOutcomes(request, outcomes, funded),
	};
}
