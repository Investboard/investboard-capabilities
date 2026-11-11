import type { CashRelease, Purchase, RebalanceRequest } from "../types.js";
import type { CalculationContext } from "../configuration.js";
import { planConsolidated } from "../contribution.js";
import {
	classMinimum,
	placePurchases,
	type UninvestedReason,
} from "./placement.js";
import { operationFee } from "./fees.js";

/** Generated purchases plus money meant for orders that no order could take. */
export interface CashPurchases {
	purchases: Purchase[];
	uninvestedUnits: number;
	reasons: UninvestedReason[];
}

/**
 * Under v5 (`legacy` false) shares below their class's smallest admissible
 * order are consolidated before placement, and leftovers are reported. Under
 * v4 the earlier rules apply unchanged and nothing is reported.
 */
export function cashPurchases(
	request: RebalanceRequest,
	externalCash: number,
	ctx: CalculationContext,
	cashReleases: CashRelease[],
	legacy: boolean,
): CashPurchases {
	const { money, configuration } = ctx;
	const released = new Map(
		cashReleases.map((c) => [c.holdingId, money.units(c.amount)]),
	);
	const available = money.sum([
		money.units(externalCash),
		...released.values(),
	]);
	const build = (budget: number): CashPurchases => {
		// Admit all candidates before ranking and applying the caller's order limit.
		const planned = planConsolidated(
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
			legacy
				? undefined
				: { minimumFor: classMinimum(request, money.units(budget), ctx) },
		);
		const placed = placePurchases(
			request,
			planned.result.allocations,
			ctx,
			legacy,
		);
		const reasons = new Set(placed.reasons);
		if (planned.blockedUnits > 0) reasons.add("uninvested_below_order_minimum");
		return {
			purchases: placed.purchases,
			uninvestedUnits: planned.blockedUnits + placed.uninvestedUnits,
			reasons: [...reasons].sort(),
		};
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
				: legacy
					? 0
					: // v5 can route one class through every depot that holds it.
						request.holdings.length);
		step++
	) {
		const fees = result.purchases.map((p) =>
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
