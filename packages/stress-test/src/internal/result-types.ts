export interface HoldingImpact {
	holdingId: string;
	isin?: string;
	ticker: string;
	name: string;
	sector: string;
	assetClass: string;
	preStressValue: number;
	postStressValue: number;
	absoluteLoss: number;
	percentageLoss: number;
	shockApplied: number;
	shockSource: "historical_price" | "sector_proxy" | "asset_class_default";
	betaAdjusted: boolean;
	historicalBasis?: "total" | "price";
	actualDateFrom?: string;
	actualDateTo?: string;
	fxShockApplied?: number | null;
	currencyMethod?:
		| "unknown"
		| "economic_exposure"
		| "hedged"
		| "direct_history";
}
export interface StressAttribution {
	preStressValueCents: number;
	postStressValueCents: number;
	netImpactCents: number;
	historicalValueFraction: number;
	lossDrivers: Array<{
		holdingId: string;
		holdingCount?: number;
		name: string;
		impactCents: number;
		portfolioImpactFraction: number;
		shockSource: HoldingImpact["shockSource"];
	}>;
	otherImpactCents: number;
}
