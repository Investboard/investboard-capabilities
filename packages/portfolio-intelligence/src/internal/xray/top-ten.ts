/** The weight of the ten largest positions. */
import { companyIdOf, isResidualId } from "./identity.js";
export const TOP_N = 10;
interface BookWeightedPosition {
	id: string;
	weight: number;
}
export function topTenBookConcentration(
	positions: readonly BookWeightedPosition[],
): number {
	const byCompany = new Map<string, number>();
	for (const p of positions) {
		if (isResidualId(p.id) || !Number.isFinite(p.weight)) continue;
		const company = companyIdOf(p.id);
		byCompany.set(company, (byCompany.get(company) ?? 0) + p.weight);
	}
	const sum = [...byCompany.values()]
		.sort((a, b) => b - a)
		.slice(0, TOP_N)
		.reduce((s, w) => s + w, 0);
	return Math.min(Number(sum.toFixed(4)), 1);
}
