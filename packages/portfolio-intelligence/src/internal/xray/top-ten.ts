/** The weight of the ten largest positions. */
import { isResidualId } from "./identity.js";
export const TOP_N = 10;
interface BookWeightedPosition {
	id: string;
	weight: number;
}
export function topTenBookConcentration(
	positions: readonly BookWeightedPosition[],
): number {
	const sum = positions
		.filter((p) => !isResidualId(p.id) && Number.isFinite(p.weight))
		.map((p) => p.weight)
		.sort((a, b) => b - a)
		.slice(0, TOP_N)
		.reduce((s, w) => s + w, 0);
	return Math.min(Number(sum.toFixed(4)), 1);
}
