import type {
	AccountRules,
	ContributionAllocation,
	Holding,
	Purchase,
	PurchaseRoute,
	RebalanceRequest,
} from "../types.js";
import type { CalculationContext } from "../configuration.js";
import { largestAllocationFirst } from "./allocation.js";
import { operationFee } from "./fees.js";

export type UninvestedReason =
	| "uninvested_below_order_minimum"
	| "uninvested_above_order_maximum";

/** Placement outcome. `uninvestedUnits` stays zero under the v4 rules. */
export interface Placement {
	purchases: Purchase[];
	uninvestedUnits: number;
	reasons: Set<UninvestedReason>;
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const first = (flag: boolean | undefined) => (flag === true ? 0 : 1);

/**
 * The holding that receives a class purchase: a declared usable price first,
 * then a declared fund or ETF before a single share, then the larger value,
 * then the smaller holding ID (code-unit order). IDs are unique, so the
 * ranking never depends on input order. Without declarations this is the
 * largest holding, then the smallest ID.
 */
export function bestPurchaseHolding(
	holdings: readonly Holding[],
): Holding | undefined {
	return [...holdings].sort(
		(a, b) =>
			first(a.priced) - first(b.priced) ||
			first(a.fund) - first(b.fund) ||
			(b.value ?? 0) - (a.value ?? 0) ||
			byText(a.holdingId, b.holdingId),
	)[0];
}

/**
 * The smallest order amount (minor units, at most `limitUnits`) an account
 * admits: a multiple of its increment, at least its minimum and the request's
 * minimum trade size, within its maximum, and larger than its known buy fee,
 * since an order may not cost what it buys. Infinity when no such amount
 * exists. Admission is monotone in the amount, so a binary search over
 * increments finds it.
 */
function admissionThreshold(
	account: AccountRules,
	minimumTrade: number,
	limitUnits: number,
	ctx: CalculationContext,
): number {
	const { money } = ctx;
	const step = money.units(account.increment);
	const cap =
		account.maximum > 0
			? Math.min(money.units(account.maximum), limitUnits)
			: limitUnits;
	let low = Math.ceil(
		Math.max(money.units(account.minimum), minimumTrade, 1) / step,
	);
	let high = Math.floor(cap / step);
	const admits = (k: number) => {
		const fee = operationFee(
			{
				holdingId: null,
				depotId: account.depotId,
				assetClass: "",
				amount: money.amount(k * step),
			},
			"buy",
			account,
			ctx,
		);
		return fee === null || fee < k * step;
	};
	if (low > high || !admits(high)) return Infinity;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		if (admits(middle)) high = middle;
		else low = middle + 1;
	}
	return low * step;
}

const accountFor = (request: RebalanceRequest, depotId: string) =>
	request.accounts?.find((a) => a.depotId === depotId);

/** Depots a purchase of the class can execute in. */
function classDepots(request: RebalanceRequest, assetClass: string): string[] {
	if (request.purchasePlacement.mode === "ordered_routes")
		return request.purchasePlacement.routes
			.filter((r) => r.assetClass === assetClass)
			.map((r) => r.depotId);
	const held = request.holdings
		.filter((h) => h.assetClass === assetClass)
		.map((h) => h.depotId);
	return held.length ? [...new Set(held)] : [request.fundingDepotId];
}

/**
 * Per class, the smallest order any of its depots admits (minor units),
 * never below the request's minimum trade size. A class without a route keeps
 * the minimum trade size: the host chose not to buy it, which is not an order
 * rule to consolidate around.
 */
export function classMinimum(
	request: RebalanceRequest,
	limitUnits: number,
	ctx: CalculationContext,
): (assetClass: string) => number {
	const minimumTrade = ctx.money.units(
		request.minTradeSize ?? ctx.money.quantum,
	);
	const known = new Map<string, number>();
	return (assetClass) => {
		const cached = known.get(assetClass);
		if (cached !== undefined) return cached;
		const depots = classDepots(request, assetClass);
		const minimum =
			depots.length === 0
				? minimumTrade
				: Math.max(
						minimumTrade,
						Math.min(
							...depots.map((depotId) => {
								const account = accountFor(request, depotId);
								return account
									? admissionThreshold(account, minimumTrade, limitUnits, ctx)
									: 0;
							}),
						),
					);
		known.set(assetClass, minimum);
		return minimum;
	};
}

/**
 * Largest-holding routes for one class amount. v4 uses the best holding only.
 * v5 continues to every other depot that holds the class: declared accounts
 * by their buy fee for this amount (lowest first, unknown last, then depot
 * ID), then depots without declared rules as the last resort. Each depot buys
 * its own best holding of the class.
 */
function largestHoldingRoutes(
	request: RebalanceRequest,
	assetClass: string,
	amount: number,
	legacy: boolean,
	ctx: CalculationContext,
): PurchaseRoute[] {
	const held = request.holdings.filter((h) => h.assetClass === assetClass);
	const best = bestPurchaseHolding(held);
	if (!best)
		return [{ assetClass, holdingId: null, depotId: request.fundingDepotId }];
	const route = (depotId: string): PurchaseRoute => ({
		assetClass,
		holdingId: bestPurchaseHolding(held.filter((h) => h.depotId === depotId))!
			.holdingId,
		depotId,
	});
	if (legacy) return [route(best.depotId)];
	const others = [...new Set(held.map((h) => h.depotId))].filter(
		(depotId) => depotId !== best.depotId,
	);
	const fee = (depotId: string) =>
		operationFee(
			{ holdingId: null, depotId, assetClass, amount },
			"buy",
			accountFor(request, depotId),
			ctx,
		) ?? Infinity;
	const declared = others
		.filter((depotId) => accountFor(request, depotId))
		.sort((a, b) => fee(a) - fee(b) || byText(a, b));
	const undeclared = others
		.filter((depotId) => !accountFor(request, depotId))
		.sort(byText);
	return [best.depotId, ...declared, ...undeclared].map(route);
}

/**
 * Account caps and increments apply before ranking and the order cap.
 * Rejected, capped and rounded amounts spill to the class's next route. Under
 * v5 an order whose known fee is at least its amount is refused, and money no
 * route takes is reported, except increment dust after an order and classes
 * the host routes nowhere. Money the order cap drops is the host's choice.
 */
export function placePurchases(
	request: RebalanceRequest,
	allocations: ContributionAllocation[],
	ctx: CalculationContext,
	legacy: boolean,
): Placement {
	const { money, configuration } = ctx;
	const candidates: Purchase[] = [];
	const reasons = new Set<UninvestedReason>();
	let uninvestedUnits = 0;
	const minimumTrade = money.units(request.minTradeSize ?? money.quantum);
	for (const allocation of allocations) {
		let remaining = money.units(allocation.amount);
		const routes =
			request.purchasePlacement.mode === "ordered_routes"
				? request.purchasePlacement.routes.filter(
						(r) => r.assetClass === allocation.assetClass,
					)
				: largestHoldingRoutes(
						request,
						allocation.assetClass,
						allocation.amount,
						legacy,
						ctx,
					);
		let placed = false;
		let capped = false;
		let rejected = false;
		let step = 1;
		for (const route of routes) {
			const rules = accountFor(request, route.depotId);
			let amount = remaining;
			let cappedHere = false;
			if (rules) {
				step = Math.max(step, money.units(rules.increment));
				if (rules.maximum > 0 && amount > money.units(rules.maximum)) {
					amount = money.units(rules.maximum);
					cappedHere = true;
				}
				amount =
					Math.floor(amount / money.units(rules.increment)) *
					money.units(rules.increment);
				if (amount < money.units(rules.minimum)) {
					rejected = true;
					continue;
				}
			}
			if (amount <= 0 || amount < minimumTrade) {
				rejected = true;
				continue;
			}
			const purchase = { ...route, amount: money.amount(amount) };
			if (!legacy && rules) {
				// An order may not cost what it buys.
				const fee = operationFee(purchase, "buy", rules, ctx);
				if (fee !== null && fee >= amount) {
					rejected = true;
					continue;
				}
			}
			candidates.push(purchase);
			placed = true;
			capped ||= cappedHere;
			remaining -= amount;
			if (remaining === 0) break;
		}
		if (legacy || remaining === 0 || routes.length === 0) continue;
		if (placed && remaining < step) continue;
		uninvestedUnits += remaining;
		if (capped) reasons.add("uninvested_above_order_maximum");
		if (rejected || !capped) reasons.add("uninvested_below_order_minimum");
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
	return {
		purchases: candidates.slice(
			0,
			request.maxTrades ?? configuration.limits.orders,
		),
		uninvestedUnits,
		reasons,
	};
}
