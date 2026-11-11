import type {
	CashRelease,
	AlternativeKind,
	Purchase,
	ReasonCode,
	RebalanceAlternative,
	RebalanceRequest,
	Sale,
} from "../types.js";
import { allocationRows, classValues } from "./allocation.js";
import { fundingEvidence } from "./funding.js";
import type { CalculationContext } from "../configuration.js";

const UNAVAILABLE = new Set<ReasonCode>([
	"sale_constraints_not_met",
	"purchase_constraints_not_met",
	"minimum_trade_not_met",
	"trade_limit_exceeded",
	"insufficient_funding",
	"reserve_shortfall",
]);

function admissionReasons(
	request: RebalanceRequest,
	sales: Sale[],
	purchases: Purchase[],
	ctx: CalculationContext,
): ReasonCode[] {
	const { money, configuration } = ctx;
	const reasons = new Set<ReasonCode>();
	const byId = new Map(request.holdings.map((h) => [h.holdingId, h]));
	if (
		sales.length + purchases.length >
		(request.maxTrades ?? configuration.limits.orders)
	)
		reasons.add("trade_limit_exceeded");
	for (const operation of [
		...sales.map((s) => ({
			amount: s.amount,
			depotId: byId.get(s.holdingId)!.depotId,
			type: "sale",
		})),
		...purchases.map((p) => ({ ...p, type: "purchase" })),
	]) {
		if (
			money.units(operation.amount) <
			money.units(request.minTradeSize ?? money.quantum)
		)
			reasons.add("minimum_trade_not_met");
		const rules = request.accounts?.find(
			(a) => a.depotId === operation.depotId,
		);
		if (
			rules &&
			(money.units(operation.amount) < money.units(rules.minimum) ||
				(rules.maximum > 0 &&
					money.units(operation.amount) > money.units(rules.maximum)) ||
				money.units(operation.amount) % money.units(rules.increment) !== 0)
		)
			reasons.add(
				operation.type === "sale"
					? "sale_constraints_not_met"
					: "purchase_constraints_not_met",
			);
	}
	return [...reasons];
}

/** Comparison rules: v4 replays saved results; v5 adds the leftover and reserve rules. */
export interface AssessRules {
	legacy: boolean;
	/** Money meant for generated orders that no order could take (v5). */
	uninvested?: { units: number; reasons: ReasonCode[] };
}

export function assess(
	request: RebalanceRequest,
	kind: AlternativeKind,
	externalCash: number,
	sales: Sale[],
	purchases: Purchase[],
	ctx: CalculationContext,
	cashReleases: CashRelease[],
	rules: AssessRules,
): RebalanceAlternative {
	const { money, configuration } = ctx;
	const evidence = fundingEvidence(
		request,
		externalCash,
		sales,
		purchases,
		ctx,
		cashReleases,
	);
	const reasons = [
		...admissionReasons(request, sales, purchases, ctx),
		...evidence.reasons,
	];
	const uninvested =
		!rules.legacy && rules.uninvested && rules.uninvested.units > 0
			? rules.uninvested
			: null;
	if (uninvested) reasons.push(...uninvested.reasons);
	const feeCost = evidence.funding.some((f) => f.fees === null)
		? null
		: money.amount(evidence.knownFeeUnits);
	const taxCost = evidence.funding.some((f) => f.taxCost === null)
		? null
		: money.amount(evidence.knownTaxUnits);
	const gross = money.sum(sales.map((s) => money.units(s.amount)));
	const invested = money.sum(purchases.map((p) => money.units(p.amount)));
	// All unknown costs are nonnegative. This upper bound can prove a deficit
	// without presenting a partial cost sum as the actual fee or tax total.
	const released = money.sum(cashReleases.map((c) => money.units(c.amount)));
	const maximumRetainedUnits = money.sum([
		released,
		money.units(externalCash),
		gross,
		-invested,
		-evidence.knownFeeUnits,
		-evidence.knownTaxUnits,
	]);
	const retained =
		feeCost === null || taxCost === null ? null : maximumRetainedUnits;
	if (maximumRetainedUnits < 0) reasons.push("insufficient_funding");
	const values = classValues(
		request.holdings.map((h) => ({
			assetClass: h.assetClass,
			value: h.value ?? 0,
		})),
		ctx,
	);
	const byId = new Map(request.holdings.map((h) => [h.holdingId, h]));
	const reserveBefore = values.get(configuration.cashAssetClass) ?? 0;
	for (const cash of cashReleases)
		values.set(
			configuration.cashAssetClass,
			money.sum([
				values.get(configuration.cashAssetClass) ?? 0,
				-money.units(cash.amount),
			]),
		);
	for (const sale of sales) {
		const assetClass = byId.get(sale.holdingId)!.assetClass;
		values.set(
			assetClass,
			money.sum([values.get(assetClass) ?? 0, -money.units(sale.amount)]),
		);
	}
	for (const purchase of purchases)
		values.set(
			purchase.assetClass,
			money.sum([
				values.get(purchase.assetClass) ?? 0,
				money.units(purchase.amount),
			]),
		);
	const maximumReserveUnits = money.sum([
		values.get(configuration.cashAssetClass) ?? 0,
		Math.max(0, maximumRetainedUnits),
	]);
	const floorUnits = money.units(request.cashFloor ?? 0);
	// v5: a reserve already below its floor that this scenario does not lower
	// is stated, not refused; keeping the book needs no execution.
	if (maximumReserveUnits < floorUnits)
		reasons.push(
			rules.legacy || maximumReserveUnits < reserveBefore
				? "reserve_shortfall"
				: "reserve_floor_not_reached",
		);
	if (retained !== null && retained >= 0)
		values.set(
			configuration.cashAssetClass,
			money.sum([values.get(configuration.cashAssetClass) ?? 0, retained]),
		);
	const reserve =
		retained === null || retained < 0
			? null
			: money.amount(values.get(configuration.cashAssetClass) ?? 0);
	const available =
		retained !== null &&
		retained >= 0 &&
		!reasons.some((r) => UNAVAILABLE.has(r));
	const rows = available
		? allocationRows(
				[...values].map(([assetClass, value]) => ({
					assetClass,
					value: money.amount(value),
				})),
				request.policy,
				ctx,
			)
		: null;
	const valueAfter =
		rows === null
			? null
			: money.amount(money.sum(rows.map((r) => money.units(r.value))));
	const reserveUnits = values.get(configuration.cashAssetClass) ?? 0;
	const shortfall =
		!rules.legacy && available && reserveUnits < floorUnits
			? { reserveShortfall: money.amount(floorUnits - reserveUnits) }
			: {};
	return {
		existingCashReleased: money.amount(released),
		cashReleases,
		kind,
		feasibility: reasons.some((r) => UNAVAILABLE.has(r))
			? "unavailable"
			: reasons.length
				? "conditional"
				: "feasible",
		reasonCodes: [...new Set(reasons)],
		externalCash,
		invested: money.amount(invested),
		feeCost,
		taxCost,
		taxCoverage:
			sales.length === 0
				? "no_sales"
				: taxCost === null
					? "unknown"
					: "supplied",
		cashRetained: available ? money.amount(retained) : null,
		...(uninvested ? { uninvestedCash: money.amount(uninvested.units) } : {}),
		valueAfter,
		reserveAfter: available ? reserve : null,
		...shortfall,
		residualDrift:
			rows === null || valueAfter === 0
				? null
				: rows.reduce((sum, r) => sum + Math.abs(r.deviation ?? 0), 0) / 2,
		rows,
		funding: evidence.funding,
		purchases,
		sales,
	};
}

export function unavailable(
	kind: AlternativeKind,
	externalCash: number,
	reasons: ReasonCode[],
): RebalanceAlternative {
	return {
		existingCashReleased: 0,
		cashReleases: [],
		kind,
		feasibility: "unavailable",
		reasonCodes: [...reasons],
		externalCash,
		invested: 0,
		feeCost: null,
		taxCost: null,
		taxCoverage: "unknown",
		cashRetained: null,
		valueAfter: null,
		reserveAfter: null,
		residualDrift: null,
		rows: null,
		funding: [],
		purchases: [],
		sales: [],
	};
}
