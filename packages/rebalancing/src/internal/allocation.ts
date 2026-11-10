import type {
	AllocationPolicy,
	AllocationPosition,
	AllocationRow,
} from "../types.js";
import type { CalculationContext } from "../configuration.js";

export function largestAllocationFirst(
	a: { assetClass: string; amount: number },
	b: { assetClass: string; amount: number },
): number {
	return (
		b.amount - a.amount ||
		(a.assetClass < b.assetClass ? -1 : a.assetClass > b.assetClass ? 1 : 0)
	);
}

export function classValues(
	positions: readonly AllocationPosition[],
	ctx: CalculationContext,
): Map<string, number> {
	const values = new Map<string, number>();
	for (const position of positions)
		values.set(
			position.assetClass,
			ctx.money.sum([
				values.get(position.assetClass) ?? 0,
				ctx.money.units(position.value),
			]),
		);
	return values;
}

export function allocationRows(
	positions: readonly AllocationPosition[],
	policy: AllocationPolicy,
	ctx: CalculationContext,
): AllocationRow[] {
	const values = classValues(positions, ctx);
	const total = ctx.money.sum(values.values());
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
				value: ctx.money.amount(value),
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
