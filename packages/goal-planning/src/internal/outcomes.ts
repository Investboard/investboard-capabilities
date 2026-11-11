import type {
	GoalCashRequest,
	GoalFundingOutcome,
	GoalReason,
	LeftOutGoal,
	LeftOutReason,
	PlanReason,
} from "../types.js";
import { fromCents, LIMITS, toCents } from "../limits.js";
import { fullMonths } from "./dates.js";

const LEFT_OUT_REASONS: ReadonlySet<GoalReason> = new Set<LeftOutReason>([
	"deadline_missing",
	"deadline_passed",
	"deadline_before_first_savings_date",
	"contribution_missing",
	"amounts_exceed_supported_range",
]);

function isLeftOutReason(reason: GoalReason): reason is LeftOutReason {
	return LEFT_OUT_REASONS.has(reason);
}

export interface PreparedGoals {
	outcomes: GoalFundingOutcome[];
	/** Empty under version 1, which schedules every goal or withholds the ledger. */
	leftOut: LeftOutGoal[];
}

/**
 * With `leaveOut` (v2), a goal without a usable deadline, a future savings
 * date, a monthly contribution or supported amounts is left out and named;
 * version 1 instead withholds the whole ledger for an unknown commitment.
 */
export function prepareOutcomes(
	request: GoalCashRequest,
	reasons: Set<PlanReason>,
	leaveOut: boolean,
): PreparedGoals {
	const usage = new Map<string, number>();
	for (const goal of request.goals) {
		for (const id of goal.startingCapital?.sourceIds ?? [])
			usage.set(id, (usage.get(id) ?? 0) + 1);
	}
	const leftOut: LeftOutGoal[] = [];
	const outcomes = [...request.goals]
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
		.map((goal) => {
			const reasonCodes: GoalReason[] = [];
			const horizonMonths =
				goal.deadline === null
					? null
					: fullMonths(request.asOfDate, goal.deadline);
			if (goal.deadline === null) reasonCodes.push("deadline_missing");
			else if (leaveOut && goal.deadline < request.asOfDate)
				reasonCodes.push("deadline_passed");
			else if (leaveOut && horizonMonths === 0)
				reasonCodes.push("deadline_before_first_savings_date");
			if (goal.monthlyContribution === null)
				reasonCodes.push("contribution_missing");
			if (goal.targetAmount === null) reasonCodes.push("target_missing");
			if (
				!leaveOut &&
				(horizonMonths === null || goal.monthlyContribution === null)
			)
				reasons.add("goal_commitment_missing");
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
			let requestedTotal =
				horizonMonths !== null && goal.monthlyContribution !== null
					? fromCents(toCents(goal.monthlyContribution) * horizonMonths)
					: null;
			if (
				toCents(requestedTotal ?? 0) + toCents(currentCapital ?? 0) >
				LIMITS.amount * 100
			) {
				requestedTotal = null;
				reasonCodes.push("amounts_exceed_supported_range");
				if (!leaveOut) reasons.add("amounts_exceed_supported_range");
			}
			const missing = leaveOut ? reasonCodes.filter(isLeftOutReason) : [];
			if (missing.length) {
				requestedTotal = null;
				leftOut.push({ goalId: goal.id, reasonCodes: missing });
			}
			return {
				goalId: goal.id,
				horizonMonths,
				currentCapital,
				requestedTotal,
				fundedTotal: null,
				noGrowthOutcome: null,
				targetGap: null,
				reasonCodes,
			};
		});
	return { outcomes, leftOut };
}

/** A left-out goal keeps its unknown funding: it is never counted as funded. */
export function finishOutcomes(
	request: GoalCashRequest,
	outcomes: GoalFundingOutcome[],
	funded: Map<string, number>,
	leftOut: ReadonlySet<string>,
): GoalFundingOutcome[] {
	return outcomes.map((outcome) => {
		if (leftOut.has(outcome.goalId)) return outcome;
		const fundedTotal = fromCents(funded.get(outcome.goalId) ?? 0);
		const noGrowthOutcome =
			outcome.currentCapital === null
				? null
				: fromCents(toCents(outcome.currentCapital) + toCents(fundedTotal));
		const target = request.goals.find(
			(goal) => goal.id === outcome.goalId,
		)?.targetAmount;
		return {
			...outcome,
			fundedTotal,
			noGrowthOutcome,
			targetGap:
				noGrowthOutcome !== null && target != null
					? fromCents(Math.max(0, toCents(target) - toCents(noGrowthOutcome)))
					: null,
		};
	});
}
