export interface StressHoldingInput {
	holdingId: string;
	isin?: string | null;
	ticker: string;
	name: string;
	sector: string | null;
	assetClass: string;
	instrumentType?: string | null;
	priceSource?: string | null;
	currentValue: number;
	currency?: string | null;
	economicCurrency?: {
		currency: string;
		hedge: "unhedged" | "hedged";
		source: string;
	} | null;
}
