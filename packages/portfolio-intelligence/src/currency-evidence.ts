import type {
	Bucket,
	CurrencyQualification,
	PortfolioRequest,
	ReportedCurrencyDimension,
	ReportedCurrencyHolding,
} from "./types.js";

export function currencyQualification(listing = false): CurrencyQualification {
	return {
		basis: listing
			? "caller_supplied_listing_denomination"
			: "country_proxy_with_name_hedge_assumption",
		methodologyVersion: listing
			? "listing-denomination-v1"
			: "country-name-currency-proxy-v1",
		independentlyVerified: false,
		hedgePolicy: "not_verified",
		stressUse: "ineligible",
		weightBasis: "whole_valued_portfolio",
		coverageBasis: listing ? "whole_valued_portfolio" : "valued_equity_value",
		hedgeRatio: null,
	};
}

/** Does not turn source declarations into independent verification or stress inputs. */
export function reportedCurrencyDimension(
	request: PortfolioRequest,
	eligible: ReadonlySet<string>,
	valuedTotal: number,
): ReportedCurrencyDimension {
	const totals = new Map<string, number>();
	const byHolding: ReportedCurrencyHolding[] = [];
	let equityValue = 0;
	for (const holding of request.holdings) {
		if (!eligible.has(holding.id) || holding.value === null || holding.value <= 0)
			continue;
		const value = holding.value;
		equityValue += value;
		const evidence = holding.currencyEvidence ?? null;
		const hedge = evidence?.hedge;
		const net = new Map<string, number>();
		const reasons: string[] = [];
		let method: ReportedCurrencyHolding["method"] = "unknown";
		if (hedge?.status === "full") {
			net.set(hedge.targetCurrency, value);
			method = "source_backed_full_hedge_model";
		} else if (hedge?.status === "unhedged" && evidence?.exposure) {
			let assigned = 0;
			for (const bucket of evidence.exposure.buckets) {
				const amount = value * bucket.weight;
				net.set(bucket.key, amount);
				assigned += amount;
			}
			if (assigned < value) net.set("unknown", Math.max(0, value - assigned));
			method = "source_backed_unhedged";
			if (assigned < value) reasons.push("incomplete_reported_exposure");
		} else {
			net.set("unknown", value);
			reasons.push(
				!hedge ? "hedge_policy_missing"
					: hedge.status === "partial" ? "partial_hedge_not_modeled"
						: hedge.status === "unknown" ? "hedge_policy_unknown"
							: "economic_exposure_missing",
			);
		}
		for (const [key, amount] of net)
			totals.set(key, (totals.get(key) ?? 0) + amount);
		const singleAssigned = [...net].filter(([, amount]) => amount > 0).length === 1;
		byHolding.push({
			holdingId: holding.id,
			isin: holding.isin ?? null,
			value,
			weight: valuedTotal > 0 ? value / valuedTotal : 0,
			evidence,
			method,
			reasonCodes: reasons,
			buckets: bucketsOf(net, valuedTotal),
			stressHandoff: method !== "unknown" && singleAssigned && (net.get("unknown") ?? 0) === 0
				? "independent_verification_required"
				: "unavailable",
		});
	}
	const unknownValue = totals.get("unknown") ?? 0;
	const assignedValue = Math.max(0, equityValue - unknownValue);
	return {
		status: !(assignedValue > 0)
			? "unavailable"
			: unknownValue > 0 ? "partial" : "available",
		basis: "caller_supplied_source",
		independentlyVerified: false,
		scope: "equity",
		weightBasis: "whole_valued_portfolio",
		coverageBasis: "valued_equity_value",
		equityValue,
		assignedValue,
		unknownValue,
		coverage: equityValue > 0 ? Math.min(1, assignedValue / equityValue) : 0,
		buckets: bucketsOf(totals, valuedTotal),
		byHolding,
	};
}

function bucketsOf(totals: ReadonlyMap<string, number>, total: number): Bucket[] {
	return [...totals]
		.map(([key, value]) => ({ key, value, weight: total > 0 ? value / total : 0 }))
		.sort((a, b) => a.key === "unknown" ? 1 : b.key === "unknown" ? -1
			: b.value - a.value || a.key.localeCompare(b.key));
}
