import type { GoalCashRequest, GoalCashResult } from "./types.js";
import { validateRequest } from "./validation.js";
import { requireInput, requireJson, shape } from "./internal/input-guards.js";
import { calculateSchedule } from "./internal/schedule.js";

export type * from "./types.js";
export { GoalCashInputError } from "./internal/input-guards.js";
export { LIMITS } from "./limits.js";
export const METHODOLOGY_VERSION = "goal-cash-schedule-v1" as const;

/** Deterministic cash feasibility, with no network, persistence or wall clock. */
export function planGoalCash(input: GoalCashRequest): GoalCashResult {
	validateRequest(input);
	return calculateSchedule({
		methodologyVersion: METHODOLOGY_VERSION,
		request: structuredClone(input),
	});
}

/** Replays original declared evidence, never current account/provider state. */
export function replayGoalCash(snapshot: unknown): GoalCashResult {
	requireJson(snapshot);
	shape(snapshot, ["methodologyVersion", "request"], "Snapshot");
	requireInput(
		snapshot.methodologyVersion === METHODOLOGY_VERSION,
		"Unsupported cash schedule methodology version",
	);
	validateRequest(snapshot.request);
	return planGoalCash(snapshot.request);
}
