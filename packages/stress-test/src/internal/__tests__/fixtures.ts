import type { StressHoldingInput } from "../types.js";

export function createStressHolding(
	overrides: Partial<StressHoldingInput> = {},
): StressHoldingInput {
	return {
		holdingId: "h-001",
		ticker: "AAPL",
		name: "Apple Inc.",
		sector: "Technology",
		assetClass: "equities",
		currentValue: 10000,
		currency: "EUR",
		...overrides,
	};
}

export const DEMO_STRESS_HOLDINGS: StressHoldingInput[] = [
	{
		holdingId: "h-001",
		ticker: "AAPL",
		name: "Apple Inc.",
		sector: "Technology",
		assetClass: "equities",
		currentValue: 15000,
	},
	{
		holdingId: "h-002",
		ticker: "JNJ",
		name: "Johnson & Johnson",
		sector: "Healthcare",
		assetClass: "equities",
		currentValue: 12000,
	},
	{
		holdingId: "h-003",
		ticker: "VWCE.DE",
		name: "Vanguard FTSE All-World UCITS ETF",
		sector: null,
		assetClass: "equities",
		currentValue: 20000,
	},
	{
		holdingId: "h-004",
		ticker: "XAUUSD",
		name: "Gold (Physical)",
		sector: null,
		assetClass: "gold",
		currentValue: 8000,
	},
	{
		holdingId: "h-005",
		ticker: "AGGH.DE",
		name: "iShares Core Global Aggregate Bond",
		sector: null,
		assetClass: "bonds",
		currentValue: 12000,
	},
	{
		holdingId: "h-006",
		ticker: "BTC",
		name: "Bitcoin",
		sector: null,
		assetClass: "crypto",
		currentValue: 7000,
	},
];
