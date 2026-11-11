import type {
	GoalCashRequest,
	GoalCashResult,
	GoalCashSnapshot,
} from "./types.js";
import { validateRequest } from "./validation.js";
import { requireInput, requireJson, shape } from "./internal/input-guards.js";
import { calculateSchedule } from "./internal/schedule.js";

export type * from "./types.js";
export { GoalCashInputError } from "./internal/input-guards.js";
export { LIMITS } from "./limits.js";
export const METHODOLOGY_VERSION = "goal-cash-schedule-v2" as const;
const LEGACY_VERSION = "goal-cash-schedule-v1" as const;

/** Deterministic cash feasibility, with no network, persistence or wall clock. */
export function planGoalCash(input: GoalCashRequest): GoalCashResult {
	validateRequest(input);
	return calculateSchedule({
		methodologyVersion: METHODOLOGY_VERSION,
		request: structuredClone(input),
	});
}

/**
 * Replays original declared evidence, never current account/provider state.
 * A version 1 snapshot is recalculated under version 1 rules, so it returns
 * the result it was saved with.
 */
export function replayGoalCash(snapshot: unknown): GoalCashResult {
	requireJson(snapshot);
	shape(snapshot, ["methodologyVersion", "request"], "Snapshot");
	const version = snapshot.methodologyVersion;
	requireInput(
		version === METHODOLOGY_VERSION || version === LEGACY_VERSION,
		"Unsupported cash schedule methodology version",
	);
	validateRequest(snapshot.request, version);
	const saved: GoalCashSnapshot = {
		methodologyVersion: version,
		request: structuredClone(snapshot.request),
	};
	return calculateSchedule(saved);
}
