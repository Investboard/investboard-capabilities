import type {
	AllocationPosition,
	CashRelease,
	RebalanceRequest,
	Sale,
} from "../types.js";
import type { CalculationContext } from "../configuration.js";

export function pooledCashRelease(
	positions: readonly AllocationPosition[],
	floor: number,
	ctx: CalculationContext,
): number {
	const cash = ctx.money.sum(
		positions
			.filter((p) => p.assetClass === ctx.configuration.cashAssetClass)
			.map((p) => ctx.money.units(p.value)),
	);
	return Math.max(0, cash - ctx.money.units(floor));
}
/** The host orders eligible sources; the pooled reserve protects all cash. */
export function releaseCash(
	request: RebalanceRequest,
	sales: Sale[],
	ctx: CalculationContext,
): CashRelease[] {
	if (request.cashDeployment.mode === "preserve") return [];
	const sold = new Map(
		sales.map((s) => [s.holdingId, ctx.money.units(s.amount)]),
	);
	const cash = request.holdings.filter(
		(h) => h.assetClass === ctx.configuration.cashAssetClass,
	);
	const available = new Map(
		cash.map((h) => [
			h.holdingId,
			ctx.money.units(h.value ?? 0) - (sold.get(h.holdingId) ?? 0),
		]),
	);
	let budget = Math.max(
		0,
		ctx.money.sum(available.values()) - ctx.money.units(request.cashFloor ?? 0),
	);
	const result: CashRelease[] = [];
	for (const holdingId of request.cashDeployment.holdingIds) {
		const amount = Math.min(budget, available.get(holdingId) ?? 0);
		if (amount > 0)
			result.push({ holdingId, amount: ctx.money.amount(amount) });
		budget -= amount;
	}
	return result;
}
