import type {
	ContributionAllocation,
	Purchase,
	PurchaseRoute,
	RebalanceRequest,
} from "../types.js";
import type { CalculationContext } from "../configuration.js";
import { largestAllocationFirst } from "./allocation.js";

export function placePurchases(
	request: RebalanceRequest,
	allocations: ContributionAllocation[],
	ctx: CalculationContext,
): Purchase[] {
	const { money, configuration } = ctx;
	const candidates: Purchase[] = [];
	for (const allocation of allocations) {
		let remaining = money.units(allocation.amount);
		let routes: PurchaseRoute[];
		if (request.purchasePlacement.mode === "ordered_routes")
			routes = request.purchasePlacement.routes.filter(
				(r) => r.assetClass === allocation.assetClass,
			);
		else {
			const held = request.holdings
				.filter((h) => h.assetClass === allocation.assetClass)
				.sort(
					(a, b) =>
						(b.value ?? 0) - (a.value ?? 0) ||
						(a.holdingId < b.holdingId
							? -1
							: a.holdingId > b.holdingId
								? 1
								: 0),
				)[0];
			routes = [
				{
					assetClass: allocation.assetClass,
					holdingId: held?.holdingId ?? null,
					depotId: held?.depotId ?? request.fundingDepotId,
				},
			];
		}
		for (const route of routes) {
			const rules = request.accounts?.find((r) => r.depotId === route.depotId);
			let amount = remaining;
			if (rules) {
				if (rules.maximum > 0)
					amount = Math.min(amount, money.units(rules.maximum));
				amount =
					Math.floor(amount / money.units(rules.increment)) *
					money.units(rules.increment);
				if (amount < money.units(rules.minimum)) continue;
			}
			if (
				amount <= 0 ||
				amount < money.units(request.minTradeSize ?? money.quantum)
			)
				continue;
			candidates.push({ ...route, amount: money.amount(amount) });
			remaining -= amount;
			if (remaining === 0) break;
		}
	}
	const placement = request.purchasePlacement;
	if (placement.mode === "largest_holding")
		candidates.sort(largestAllocationFirst);
	else {
		const identity = (r: PurchaseRoute) =>
			JSON.stringify([r.assetClass, r.depotId, r.holdingId]);
		const order = new Map(placement.routes.map((r, i) => [identity(r), i]));
		candidates.sort(
			(a, b) => order.get(identity(a))! - order.get(identity(b))!,
		);
	}
	return candidates.slice(0, request.maxTrades ?? configuration.limits.orders);
}
