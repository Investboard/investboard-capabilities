import type { GoalCashRequest } from "../src/index.js";

export function request(
	overrides: Partial<GoalCashRequest> = {},
): GoalCashRequest {
	return {
		reportingCurrency: "EUR",
		asOfDate: "2026-01-01",
		unallocatedCash: 1000,
		reserveFloor: 1000,
		monthlyCapacity: 1000,
		obligationsComplete: true,
		paymentsTreatment: "already_netted",
		recurringPayments: [],
		liquidityNeeds: [{ id: "expense", dueDate: "2027-01-01", amount: 1000 }],
		goals: [
			{
				id: "goal",
				deadline: "2027-01-01",
				monthlyContribution: 500,
				targetAmount: 10000,
				startingCapital: { amount: 0, asOfDate: "2026-01-01", sourceIds: [] },
			},
		],
		...overrides,
	};
}
