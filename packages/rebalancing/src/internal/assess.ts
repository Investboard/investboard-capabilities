import type {
	AlternativeKind,
	Purchase,
	ReasonCode,
	RebalanceAlternative,
	RebalanceRequest,
	Sale,
} from "../types.js";
import { allocationRows, classValues } from "./allocation.js";
import { fundingEvidence } from "./funding.js";
import { toCents } from "./money.js";

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
): ReasonCode[] {
	const reasons = new Set<ReasonCode>();
	const byId = new Map(request.holdings.map((h) => [h.holdingId, h]));
	if (sales.length + purchases.length > (request.maxTrades ?? 100))
		reasons.add("trade_limit_exceeded");
	for (const operation of [
		...sales.map((s) => ({
			amount: s.amount,
			depotId: byId.get(s.holdingId)!.depotId,
			type: "sale",
		})),
		...purchases.map((p) => ({ ...p, type: "purchase" })),
	]) {
		if (toCents(operation.amount) < toCents(request.minTradeSize ?? 0.01))
			reasons.add("minimum_trade_not_met");
		const rules = request.accounts?.find(
			(a) => a.depotId === operation.depotId,
		);
		if (
			rules &&
			(toCents(operation.amount) < toCents(rules.minimum) ||
				(rules.maximum > 0 &&
					toCents(operation.amount) > toCents(rules.maximum)) ||
				toCents(operation.amount) % toCents(rules.increment) !== 0)
		)
			reasons.add(
				operation.type === "sale"
					? "sale_constraints_not_met"
					: "purchase_constraints_not_met",
			);
	}
	return [...reasons];
}

export function assess(
	request: RebalanceRequest,
	kind: AlternativeKind,
	externalCash: number,
	sales: Sale[],
	purchases: Purchase[],
): RebalanceAlternative {
	const evidence = fundingEvidence(request, externalCash, sales, purchases);
	const reasons = [
		...admissionReasons(request, sales, purchases),
		...evidence.reasons,
	];
	const feeCost = evidence.funding.some((f) => f.fees === null)
		? null
		: evidence.funding.reduce((sum, f) => sum + toCents(f.fees!), 0) / 100;
	const taxCost = evidence.funding.some((f) => f.taxCost === null)
		? null
		: evidence.funding.reduce((sum, f) => sum + toCents(f.taxCost!), 0) / 100;
	const gross = sales.reduce((sum, s) => sum + toCents(s.amount), 0);
	const invested = purchases.reduce((sum, p) => sum + toCents(p.amount), 0);
	const retained =
		feeCost === null || taxCost === null
			? null
			: toCents(externalCash) +
				gross -
				invested -
				toCents(feeCost) -
				toCents(taxCost);
	if (retained !== null && retained < 0) reasons.push("insufficient_funding");
	const values = classValues(
		request.holdings.map((h) => ({
			assetClass: h.assetClass,
			value: h.value ?? 0,
		})),
	);
	const byId = new Map(request.holdings.map((h) => [h.holdingId, h]));
	for (const sale of sales) {
		const assetClass = byId.get(sale.holdingId)!.assetClass;
		values.set(
			assetClass,
			(values.get(assetClass) ?? 0) - toCents(sale.amount),
		);
	}
	for (const purchase of purchases)
		values.set(
			purchase.assetClass,
			(values.get(purchase.assetClass) ?? 0) + toCents(purchase.amount),
		);
	if (retained !== null && retained >= 0)
		values.set("cash", (values.get("cash") ?? 0) + retained);
	const reserve =
		retained === null || retained < 0 ? null : (values.get("cash") ?? 0) / 100;
	if (reserve !== null && toCents(reserve) < toCents(request.cashFloor ?? 0))
		reasons.push("reserve_shortfall");
	const available =
		retained !== null &&
		retained >= 0 &&
		!reasons.some((r) => UNAVAILABLE.has(r));
	const rows = available
		? allocationRows(
				[...values].map(([assetClass, value]) => ({
					assetClass,
					value: value / 100,
				})),
				request.policy,
			)
		: null;
	const valueAfter =
		rows === null
			? null
			: rows.reduce((sum, r) => sum + toCents(r.value), 0) / 100;
	return {
		kind,
		feasibility: reasons.some((r) => UNAVAILABLE.has(r))
			? "unavailable"
			: reasons.length
				? "conditional"
				: "feasible",
		reasonCodes: [...new Set(reasons)],
		externalCash,
		invested: invested / 100,
		feeCost,
		taxCost,
		taxCoverage:
			sales.length === 0
				? "no_sales"
				: taxCost === null
					? "unknown"
					: "supplied",
		cashRetained: available ? retained / 100 : null,
		valueAfter,
		reserveAfter: available ? reserve : null,
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
