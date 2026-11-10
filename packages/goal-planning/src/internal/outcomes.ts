import type { GoalCashRequest, GoalFundingOutcome, GoalReason, PlanReason } from "../types.js";
import { fromCents, LIMITS, toCents } from "../limits.js";
import { fullMonths } from "./dates.js";

export function prepareOutcomes(request: GoalCashRequest, reasons: Set<PlanReason>): GoalFundingOutcome[] {
	const usage = new Map<string, number>();
	for (const goal of request.goals) {
		for (const id of goal.startingCapital?.sourceIds ?? []) usage.set(id, (usage.get(id) ?? 0) + 1);
	}
	return [...request.goals].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map((goal) => {
		const reasonCodes: GoalReason[] = [];
		const horizonMonths = goal.deadline === null ? null : fullMonths(request.asOfDate, goal.deadline);
		if (horizonMonths === null) reasonCodes.push("deadline_missing");
		if (goal.monthlyContribution === null) reasonCodes.push("contribution_missing");
		if (goal.targetAmount === null) reasonCodes.push("target_missing");
		if (horizonMonths === null || goal.monthlyContribution === null) reasons.add("goal_commitment_missing");
		const source = goal.startingCapital;
		let currentCapital: number | null = source?.amount ?? null;
		if (!source) reasonCodes.push("starting_capital_missing");
		if (source && source.asOfDate !== request.asOfDate) {
			currentCapital = null;
			reasonCodes.push("starting_capital_not_current");
		}
		if (source?.sourceIds.some((id) => (usage.get(id) ?? 0) > 1)) {
			currentCapital = null;
			reasonCodes.push("starting_capital_shared_by_goals");
		}
		let requestedTotal = horizonMonths !== null && goal.monthlyContribution !== null
			? fromCents(toCents(goal.monthlyContribution) * horizonMonths) : null;
		if (toCents(requestedTotal ?? 0) + toCents(currentCapital ?? 0) > LIMITS.amount * 100) {
			requestedTotal = null;
			reasonCodes.push("amounts_exceed_supported_range");
			reasons.add("amounts_exceed_supported_range");
		}
		return {
			goalId: goal.id, horizonMonths, currentCapital, requestedTotal,
			fundedTotal: null, noGrowthOutcome: null, targetGap: null, reasonCodes,
		};
	});
}

export function finishOutcomes(request: GoalCashRequest, outcomes: GoalFundingOutcome[], funded: Map<string, number>): GoalFundingOutcome[] {
	return outcomes.map((outcome) => {
		const fundedTotal = fromCents(funded.get(outcome.goalId) ?? 0);
		const noGrowthOutcome = outcome.currentCapital === null ? null
			: fromCents(toCents(outcome.currentCapital) + toCents(fundedTotal));
		const target = request.goals.find((goal) => goal.id === outcome.goalId)?.targetAmount;
		return {
			...outcome, fundedTotal, noGrowthOutcome,
			targetGap: noGrowthOutcome !== null && target != null
				? fromCents(Math.max(0, toCents(target) - toCents(noGrowthOutcome))) : null,
		};
	});
}
