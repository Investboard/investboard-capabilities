import type {
	CashRelease,
	FundingRow,
	Purchase,
	ReasonCode,
	RebalanceRequest,
	Sale,
} from "../types.js";
import type { CalculationContext } from "../configuration.js";
import { operationFee } from "./fees.js";

export function fundingEvidence(
	request: RebalanceRequest,
	externalCash: number,
	sales: Sale[],
	purchases: Purchase[],
	ctx: CalculationContext,
	cashReleases: CashRelease[],
): {
	funding: FundingRow[];
	reasons: ReasonCode[];
	knownFeeUnits: number;
	knownTaxUnits: number;
} {
	const { money } = ctx;
	const byId = new Map(request.holdings.map((h) => [h.holdingId, h]));
	const reasons = new Set<ReasonCode>();
	const knownFees: number[] = [],
		knownTaxes: number[] = [];
	const placedSales = sales.map((sale) => ({
		...sale,
		depotId: byId.get(sale.holdingId)!.depotId,
	}));
	const placedCash = cashReleases.map((c) => ({
		...c,
		depotId: byId.get(c.holdingId)!.depotId,
	}));
	const ids = [
		...new Set([
			request.fundingDepotId,
			...placedSales.map((s) => s.depotId),
			...placedCash.map((c) => c.depotId),
			...purchases.map((p) => p.depotId),
		]),
	].sort();
	const funding = ids.map((depotId) => {
		const localSales = placedSales.filter((s) => s.depotId === depotId);
		const localBuys = purchases.filter((p) => p.depotId === depotId);
		const count = localSales.length + localBuys.length;
		const account = request.accounts?.find((a) => a.depotId === depotId);
		if (count > 0 && !account) reasons.add("account_rules_unknown");
		const orderFees = [
			...localSales.map((s) => operationFee(s, "sell", account, ctx)),
			...localBuys.map((p) => operationFee(p, "buy", account, ctx)),
		];
		const knownLocalFees = money.sum(
			orderFees.filter((f): f is number => f !== null),
		);
		knownFees.push(knownLocalFees);
		const fees = orderFees.some((f) => f === null) ? null : knownLocalFees;
		if (fees === null) reasons.add("fees_unknown");
		// Preserve each known component even when another fee or tax is unknown.
		const localKnownTax = money.sum(
			localSales.map((s) => (s.tax === null ? 0 : money.units(s.tax.amount))),
		);
		knownTaxes.push(localKnownTax);
		const tax = localSales.some((s) => s.tax === null) ? null : localKnownTax;
		if (tax === null) reasons.add("sale_tax_unknown");
		const cash =
			depotId === request.fundingDepotId ? money.units(externalCash) : 0;
		const existingCash = money.sum(
			placedCash
				.filter((c) => c.depotId === depotId)
				.map((c) => money.units(c.amount)),
		);
		const gross = money.sum(localSales.map((s) => money.units(s.amount)));
		const spent = money.sum(localBuys.map((p) => money.units(p.amount)));
		const inflow =
			tax === null ? null : money.sum([cash, existingCash, gross, -tax]);
		const transfer =
			inflow === null || fees === null
				? null
				: Math.max(0, money.sum([spent, fees, -inflow]));
		if (transfer !== null && transfer > 0 && !request.transfersConfirmed)
			reasons.add("funding_transfer_required");
		return {
			depotId,
			existingCashReleased: money.amount(existingCash),
			externalCash: money.amount(cash),
			grossSales: money.amount(gross),
			taxCost: tax === null ? null : money.amount(tax),
			fees: fees === null ? null : money.amount(fees),
			purchases: money.amount(spent),
			netInflow: inflow === null ? null : money.amount(inflow),
			transferRequired: transfer === null ? null : money.amount(transfer),
		};
	});
	return {
		funding,
		reasons: [...reasons],
		knownFeeUnits: money.sum(knownFees),
		knownTaxUnits: money.sum(knownTaxes),
	};
}
