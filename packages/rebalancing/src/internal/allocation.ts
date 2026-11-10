import type {
	AllocationPolicy,
	AllocationPosition,
	AllocationRow,
} from "../types.js";
import { toCents } from "./money.js";

export function classValues(
	positions: readonly AllocationPosition[],
): Map<string, number> {
	const values = new Map<string, number>();
	for (const position of positions)
		values.set(
			position.assetClass,
			(values.get(position.assetClass) ?? 0) + toCents(position.value),
		);
	return values;
}

export function allocationRows(
	positions: readonly AllocationPosition[],
	policy: AllocationPolicy,
): AllocationRow[] {
	const values = classValues(positions);
	const total = [...values.values()].reduce((sum, value) => sum + value, 0);
	return [...new Set([...values.keys(), ...Object.keys(policy)])]
		.sort()
		.map((assetClass) => {
			const band = Object.hasOwn(policy, assetClass)
				? policy[assetClass]
				: undefined;
			const value = values.get(assetClass) ?? 0;
			const current = total > 0 ? value / total : null;
			return {
				assetClass,
				value: value / 100,
				current,
				target: band?.target ?? 0,
				minimum: band?.min ?? 0,
				maximum: band?.max ?? 0,
				deviation: current === null ? null : current - (band?.target ?? 0),
				inRange:
					current === null
						? null
						: current >= (band?.min ?? 0) - 1e-9 &&
							current <= (band?.max ?? 0) + 1e-9,
			};
		});
}
