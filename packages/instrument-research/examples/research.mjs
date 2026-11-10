import assert from "node:assert/strict";
import {
	evaluateInstrumentPair,
	evaluateInstrumentResearch,
	replayInstrumentPair,
	replayInstrumentResearch,
} from "../dist/index.js";

// Entirely synthetic identities, prices, rates and statements. No provider access.
const listing = {
	symbol: "SYNTH.L",
	isin: "GB0000000001",
	exchange: "XLON",
	currency: "GBP",
	kind: "stock",
};
const other = {
	...listing,
	symbol: "SYNTH.SW",
	exchange: "XSWX",
	currency: "CHF",
};
const source = (id) => ({
	id,
	revision: "synthetic-v1",
	observedAt: "2025-03-01T12:00:00Z",
	publishedAt: null,
	url: null,
});
const dates = Array.from({ length: 379 }, (_, index) =>
	new Date(Date.parse("2023-12-20") + index * 864e5).toISOString().slice(0, 10),
);
const prices = dates.map((date, index) => ({
	date,
	value: 100 * (1 + index / 10000) ** (index / 30),
}));
const fx = {
	baseCurrency: "GBP",
	quoteCurrency: "CHF",
	source: source("fx"),
	points: dates.map((date, i) => ({ date, value: 1.1 + i / 10000 })),
};
const history = {
	listing,
	basis: "distribution_adjusted",
	source: source("prices"),
	points: prices,
	fx,
};
const base = {
	listing,
	periodEnd: "2024-12-31",
	fiscalYear: "2024",
	period: "FY",
	currency: "USD",
	filingDate: "2025-02-01",
	acceptedAt: null,
};
const input = {
	asOf: "2025-03-02T00:00:00Z",
	from: "2024-01-01",
	to: "2025-01-01",
	vintage: "retained",
	listing,
	reportingCurrency: "CHF",
	history,
	statements: [
		{
			...base,
			kind: "income",
			source: source("income"),
			values: { revenue: 1000, netIncome: 100 },
		},
		{
			...base,
			kind: "balance",
			source: source("balance"),
			values: { equity: 400, totalDebt: 200 },
		},
		{
			...base,
			kind: "cash_flow",
			source: source("cash-flow"),
			values: {
				operatingCashFlow: 150,
				capitalExpenditure: -50,
				freeCashFlow: 100,
			},
		},
	],
	capitalizations: [
		{
			listing,
			periodEnd: base.periodEnd,
			fiscalYear: base.fiscalYear,
			currency: "USD",
			value: 2000,
			source: source("period-capitalization"),
		},
	],
	investment: { lumpSum: 1000, monthlyContribution: 100 },
};
const research = evaluateInstrumentResearch(input);
const pairSource = (id) => ({
	...source(id),
	observedAt: "2025-01-02T00:00:00Z",
});
const comparison = evaluateInstrumentPair({
	asOf: "2025-01-02T12:00:00Z",
	vintage: "retained",
	listings: [listing, other],
	reportingCurrency: "CHF",
	horizons: [1, 3],
	series: [
		{
			...history,
			source: pairSource("prices"),
			fx: { ...fx, source: pairSource("fx") },
		},
		{
			listing: other,
			basis: "price",
			source: pairSource("other-prices"),
			points: prices.map((p) => ({ ...p, value: p.value * 2 })),
			fx: null,
		},
	],
});
assert.deepEqual(
	replayInstrumentResearch(JSON.parse(JSON.stringify(research.snapshot))),
	research,
);
assert.deepEqual(
	replayInstrumentPair(JSON.parse(JSON.stringify(comparison.snapshot))),
	comparison,
);
assert.equal(research.fundamentals.periods[0].valuation.priceToEarnings, 20);
assert.equal(research.fundamentals.periods[0].currency, "USD");
assert.notEqual(comparison.correlations[0].coefficient, null);
assert.equal(comparison.correlations[1].coefficient, null);
console.log(
	JSON.stringify(
		{
			synthetic: true,
			reportingCurrency: input.reportingCurrency,
			history: research.history,
			reportedPeriod: research.fundamentals.periods[0],
			pair: comparison.correlations,
			replayVerified: true,
		},
		null,
		2,
	),
);
