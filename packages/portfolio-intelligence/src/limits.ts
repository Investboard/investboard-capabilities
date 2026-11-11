/** Resource and numeric bounds. Data and its sources are always the caller's. */
export const LIMITS = Object.freeze({
	holdings: 2_000,
	funds: 500,
	constituentsPerFund: 10_000,
	securities: 50_000,
	amount: 1e12,
	correlationHoldings: 200,
	closesPerHolding: 4_000,
});
