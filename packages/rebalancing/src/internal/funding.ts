import type {
	FundingRow,
	Purchase,
	ReasonCode,
	RebalanceRequest,
	Sale,
} from "../types.js";
import { toCents } from "./money.js";

export function fundingEvidence(
	request: RebalanceRequest,
	externalCash: number,
	sales: Sale[],
	purchases: Purchase[],
): {
	funding: FundingRow[];
	reasons: ReasonCode[];
	knownFeeCents: number;
	knownTaxCents: number;
} {
	const byId = new Map(request.holdings.map((h) => [h.holdingId, h]));
	const reasons = new Set<ReasonCode>();
	let knownFeeCents = 0;
	let knownTaxCents = 0;
	const placedSales = sales.map((sale) => ({
		...sale,
		depotId: byId.get(sale.holdingId)!.depotId,
	}));
	const ids = [
		...new Set([
			request.fundingDepotId,
			...placedSales.map((s) => s.depotId),
			...purchases.map((p) => p.depotId),
		]),
	].sort();
	const funding = ids.map((depotId) => {
		const localSales = placedSales.filter((s) => s.depotId === depotId);
		const localBuys = purchases.filter((p) => p.depotId === depotId);
		const count = localSales.length + localBuys.length;
		const account = request.accounts?.find((a) => a.depotId === depotId);
		if (count > 0 && !account) reasons.add("account_rules_unknown");
		const fees =
			count === 0
				? 0
				: account?.feePerTrade == null
					? null
					: toCents(account.feePerTrade) * count;
		if (fees === null) reasons.add("fees_unknown");
		knownFeeCents += fees ?? 0;
		// Taxes follow the holding sold, never a pooled gross-proceeds ratio.
		const localKnownTax = localSales.reduce(
			(sum, s) => sum + (s.tax === null ? 0 : toCents(s.tax.amount)),
			0,
		);
		knownTaxCents += localKnownTax;
		const tax = localSales.some((s) => s.tax === null) ? null : localKnownTax;
		if (tax === null) reasons.add("sale_tax_unknown");
		const cash = depotId === request.fundingDepotId ? toCents(externalCash) : 0;
		const gross = localSales.reduce((sum, s) => sum + toCents(s.amount), 0);
		const spent = localBuys.reduce((sum, p) => sum + toCents(p.amount), 0);
		const inflow = tax === null ? null : cash + gross - tax;
		const transfer =
			inflow === null || fees === null
				? null
				: Math.max(0, spent + fees - inflow);
		if (transfer !== null && transfer > 0 && !request.transfersConfirmed)
			reasons.add("funding_transfer_required");
		return {
			depotId,
			externalCash: cash / 100,
			grossSales: gross / 100,
			taxCost: tax === null ? null : tax / 100,
			fees: fees === null ? null : fees / 100,
			purchases: spent / 100,
			netInflow: inflow === null ? null : inflow / 100,
			transferRequired: transfer === null ? null : transfer / 100,
		};
	});
	return { funding, reasons: [...reasons], knownFeeCents, knownTaxCents };
}
