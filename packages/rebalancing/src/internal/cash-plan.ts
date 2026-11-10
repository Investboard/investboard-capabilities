import type { Purchase, RebalanceRequest } from "../types.js";
import { planContribution } from "../contribution.js";
import { toCents } from "./money.js";
import { largestAllocationFirst } from "./allocation.js";

export function cashPurchases(
	request: RebalanceRequest,
	externalCash: number,
): Purchase[] {
	const build = (budget: number) => {
		// Stage every candidate. Rejected broker amounts do not consume an order.
		const planned = planContribution({
			positions: request.holdings.map((h) => ({
				assetClass: h.assetClass,
				value: h.value ?? 0,
			})),
			policy: request.policy,
			contribution: budget,
			cashFloor: request.cashFloor ?? 0,
			minTradeSize: request.minTradeSize ?? 0.01,
		});
		return planned.allocations
			.flatMap((a) => {
				const held = request.holdings
					.filter((h) => h.assetClass === a.assetClass)
					.sort(
						(a, b) =>
							(b.value ?? 0) - (a.value ?? 0) ||
							(a.holdingId < b.holdingId
								? -1
								: a.holdingId > b.holdingId
									? 1
									: 0),
					)[0];
				const depotId = held?.depotId ?? request.fundingDepotId;
				const rules = request.accounts?.find((r) => r.depotId === depotId);
				let amount = toCents(a.amount);
				if (rules) {
					if (rules.maximum > 0)
						amount = Math.min(amount, toCents(rules.maximum));
					amount =
						Math.floor(amount / toCents(rules.increment)) *
						toCents(rules.increment);
					if (amount < toCents(rules.minimum)) return [];
				}
				if (amount <= 0 || amount < toCents(request.minTradeSize ?? 0.01))
					return [];
				return [
					{
						holdingId: held?.holdingId ?? null,
						depotId,
						assetClass: a.assetClass,
						amount: amount / 100,
					},
				];
			})
			.sort(largestAllocationFirst)
			.slice(0, request.maxTrades ?? 100);
	};
	let feeReserve = 0;
	let result = build(externalCash);
	// Fees belong only to selected allocations. The monotone reserve is bounded
	// by the fees for all target classes; removed allocations leave cash behind.
	for (let step = 0; step <= Object.keys(request.policy).length; step++) {
		let fees = 0;
		for (const purchase of result) {
			const fee = request.accounts?.find(
				(a) => a.depotId === purchase.depotId,
			)?.feePerTrade;
			if (fee == null) return result;
			fees += toCents(fee);
		}
		if (fees <= feeReserve) return result;
		feeReserve = fees;
		result = build(Math.max(0, toCents(externalCash) - feeReserve) / 100);
	}
	return result;
}
