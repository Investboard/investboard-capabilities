import type { HoldingImpact } from "./result-types.js";
export interface RankedDrawdowns {
	worstPositions: HoldingImpact[];
	bestPositions: HoldingImpact[];
}
export function rankDrawdowns(impacts: HoldingImpact[]): RankedDrawdowns {
	if (impacts.length === 0) {
		return { worstPositions: [], bestPositions: [] };
	}
	const sortedWorst = [...impacts].sort(
		(a, b) => a.absoluteLoss - b.absoluteLoss,
	);
	const worstPositions = sortedWorst.slice(0, 5);
	const sortedBest = [...impacts].sort(
		(a, b) => b.absoluteLoss - a.absoluteLoss,
	);
	const bestPositions = sortedBest.slice(0, 3);
	return { worstPositions, bestPositions };
}
