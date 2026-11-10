import type { GoalCashRequest, RecurringPayment } from "../types.js";
import { LIMITS, toCents } from "../limits.js";
import { savingsDate } from "./dates.js";

export interface CashEvent {
	date: string;
	month: number | null;
	liquidityDueCents: number;
	netCapacityCents: number;
}

export function paymentIsOngoing(
	payment: RecurringPayment,
	day: string,
): boolean {
	return (
		(payment.startDate === null || payment.startDate <= day) &&
		(payment.endDate === null || payment.endDate >= day)
	);
}

export function buildTimeline(
	request: GoalCashRequest,
	months: number,
): CashEvent[] {
	const byDate = new Map<string, CashEvent>();
	for (let month = 1; month <= months; month++) {
		const date = savingsDate(request.asOfDate, month);
		const payments =
			request.paymentsTreatment === "subtract_recorded"
				? request.recurringPayments
						.filter((payment) => paymentIsOngoing(payment, date))
						.reduce(
							(sum, payment) => sum + toCents(payment.monthlyAmount ?? 0),
							0,
						)
				: 0;
		byDate.set(date, {
			date,
			month,
			liquidityDueCents: 0,
			netCapacityCents: toCents(request.monthlyCapacity ?? 0) - payments,
		});
	}
	for (const need of request.liquidityNeeds) {
		const event = byDate.get(need.dueDate) ?? {
			date: need.dueDate,
			month: null,
			liquidityDueCents: 0,
			netCapacityCents: 0,
		};
		event.liquidityDueCents += toCents(need.amount);
		byDate.set(need.dueDate, event);
	}
	return [...byDate.values()].sort((a, b) =>
		a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
	);
}

/** Cash above the floor needed AFTER each event to fund future mandatory costs.
 * A dated payment occurs before that day's monthly net capacity, so later
 * capacity can fund a later payment but cannot cure its on-time shortfall. */
export function futureRequirements(
	events: readonly CashEvent[],
): number[] | null {
	const after: number[] = new Array(events.length);
	let required = 0;
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i];
		if (!event) return null;
		after[i] = required;
		required =
			event.liquidityDueCents + Math.max(0, required - event.netCapacityCents);
		if (
			!Number.isSafeInteger(required) ||
			required > LIMITS.amount * 100 ||
			!Number.isSafeInteger(event.netCapacityCents) ||
			Math.abs(event.netCapacityCents) > LIMITS.amount * 100
		)
			return null;
	}
	return after;
}
