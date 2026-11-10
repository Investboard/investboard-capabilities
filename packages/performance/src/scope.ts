import { prepareHistory } from "./history.js";
import type { PerformanceRequest } from "./types.js";
import { sumMoney } from "./internal/money/cents.js";

/** A fixed basket, including closed positions, supplies NAV and every flow. */
export function projectScope(
	input: PerformanceRequest,
): PerformanceRequest | null {
	if (!input.scopeHoldingIds) return input;
	const ids = new Set(input.scopeHoldingIds);
	const first = input.snapshots[0]!.date;
	const last = input.snapshots.at(-1)!.date;
	const inside = (date: string) => date >= first && date <= last;
	if (
		input.cashFlows.some(
			(flow) => inside(flow.date) && flow.holdingId === null,
		) ||
		input.recordedCosts?.some(
			(cost) => inside(cost.date) && cost.holdingId === null,
		)
	)
		return null;
	const history = prepareHistory(input);
	if (
		history.evidence.some(
			(p) =>
				ids.has(p.id) &&
				(p.status === "excluded" || p.missingValuationCount > 0),
		)
	)
		return null;
	const maps = history.series
		.filter((p) => ids.has(p.id))
		.map((p) => new Map(p.values.map((v) => [v.date, v.value])));
	const snapshots = input.snapshots.map((point) => ({
		date: point.date,
		value: sumMoney(maps.map((map) => map.get(point.date) ?? 0)),
	}));
	// A projected scope crossing changes custody into external security funding.
	const effects = input.effects
		.filter((effect) => ids.has(effect.holdingId))
		.map((effect) => {
			if (
				!effect.transferGroup ||
				input.effects.filter(
					(e) =>
						e.transferGroup === effect.transferGroup && ids.has(e.holdingId),
				).length === 2
			)
				return effect;
			const { transferGroup: _group, ...external } = effect;
			return external;
		});
	const { scopeHoldingIds: _ids, recordedCosts, ...rest } = input;
	return {
		...rest,
		positions: input.positions.filter((p) => ids.has(p.id)),
		snapshots,
		effects,
		cashFlows: input.cashFlows.filter(
			(f) => f.holdingId !== null && ids.has(f.holdingId),
		),
		...(recordedCosts === undefined
			? {}
			: {
					recordedCosts: recordedCosts.filter(
						(c) => c.holdingId !== null && ids.has(c.holdingId),
					),
				}),
	};
}
