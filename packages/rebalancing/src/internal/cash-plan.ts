import type { CashRelease, Purchase, RebalanceRequest } from "../types.js";
import type { CalculationContext } from "../configuration.js";
import { planContribution } from "../contribution.js";
import { placePurchases } from "./placement.js";
import { operationFee } from "./fees.js";

export function cashPurchases(
	request: RebalanceRequest,
	externalCash: number,
	ctx: CalculationContext,
	cashReleases: CashRelease[],
): Purchase[] {
	const { money, configuration } = ctx;
	const released = new Map(
		cashReleases.map((c) => [c.holdingId, money.units(c.amount)]),
	);
	const available = money.sum([
		money.units(externalCash),
		...released.values(),
	]);
	const build = (budget: number) => {
		// Admit all candidates before ranking and applying the caller's order limit.
		const planned = planContribution(
			{
				configuration,
				// Existing cash has already entered this budget through cashReleases.
				cashDeployment: "preserve",
				positions: request.holdings.map((h) => ({
					assetClass: h.assetClass,
					value: money.amount(
						money.units(h.value ?? 0) - (released.get(h.holdingId) ?? 0),
					),
				})),
				policy: request.policy,
				contribution: budget,
				cashFloor: request.cashFloor ?? 0,
				minTradeSize: request.minTradeSize ?? money.quantum,
			},
			ctx,
			false,
		);
		return placePurchases(request, planned.allocations, ctx);
	};
	let feeReserve = 0;
	let result = build(money.amount(available));
	// Reprice selected orders after every admission change. The reserve only
	// increases; excess reserve stays cash when an order disappears.
	for (
		let step = 0;
		step <=
		Object.keys(request.policy).length +
			(request.purchasePlacement.mode === "ordered_routes"
				? request.purchasePlacement.routes.length
				: 0);
		step++
	) {
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
		result = build(money.amount(Math.max(0, available - feeReserve)));
	}
	return result;
}
