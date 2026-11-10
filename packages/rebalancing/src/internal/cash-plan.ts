import type { Purchase, RebalanceRequest } from "../types.js";
import type { CalculationContext } from "../configuration.js";
import { planContribution } from "../contribution.js";
import { largestAllocationFirst } from "./allocation.js";
import { operationFee } from "./fees.js";

export function cashPurchases(
	request: RebalanceRequest,
	externalCash: number,
	ctx: CalculationContext,
): Purchase[] {
	const { money, configuration } = ctx;
	const build = (budget: number) => {
		// Admit all candidates before ranking and applying the caller's order limit.
		const planned = planContribution(
			{
				configuration,
				positions: request.holdings.map((h) => ({
					assetClass: h.assetClass,
					value: h.value ?? 0,
				})),
				policy: request.policy,
				contribution: budget,
				cashFloor: request.cashFloor ?? 0,
				minTradeSize: request.minTradeSize ?? money.quantum,
			},
			ctx,
			false,
		);
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
				let amount = money.units(a.amount);
				if (rules) {
					if (rules.maximum > 0)
						amount = Math.min(amount, money.units(rules.maximum));
					amount =
						Math.floor(amount / money.units(rules.increment)) *
						money.units(rules.increment);
					if (amount < money.units(rules.minimum)) return [];
				}
				if (
					amount <= 0 ||
					amount < money.units(request.minTradeSize ?? money.quantum)
				)
					return [];
				return [
					{
						holdingId: held?.holdingId ?? null,
						depotId,
						assetClass: a.assetClass,
						amount: money.amount(amount),
					},
				];
			})
			.sort(largestAllocationFirst)
			.slice(0, request.maxTrades ?? configuration.limits.orders);
	};
	let feeReserve = 0;
	let result = build(externalCash);
	// Reserve monotonically. As budgets shrink, known nonnegative schedules cannot
	// increase the charge for any selected class; removed orders leave cash behind.
	for (let step = 0; step <= Object.keys(request.policy).length; step++) {
		const fees = result.map((p) =>
			operationFee(
				p,
				"buy",
				request.accounts?.find((a) => a.depotId === p.depotId),
				ctx,
			),
		);
		if (fees.some((f) => f === null)) return result;
		const total = money.sum(fees as number[]);
		if (total <= feeReserve) return result;
		feeReserve = total;
		result = build(
			money.amount(Math.max(0, money.units(externalCash) - feeReserve)),
		);
	}
	return result;
}
