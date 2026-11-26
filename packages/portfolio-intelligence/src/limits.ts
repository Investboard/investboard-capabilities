/** Resource and numeric bounds. Data and its sources are always the caller's. */
export const LIMITS = Object.freeze({
	holdings: 2_000,
	funds: 500,
	constituentsPerFund: 10_000,
	securities: 50_000,
	amount: 1e12,
	correlationHoldings: 200,
	closesPerHolding: 4_000,
	minMarketValue: 1e-9,
	maxMarketValue: 1e12,
	inputNodes: 5_000_000,
	inputDepth: 12,
	textLength: 2_000,
	inputTextLength: 32_000_000,
});
