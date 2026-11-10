import assert from "node:assert/strict";
import { evaluatePerformance, replayPerformance } from "../dist/index.js";

// Entirely synthetic. Rates convert USD into GBP, not the inverse.
const request = {
	reportingCurrency: "GBP",
	asOfDate: "2026-01-05",
	ledgerComplete: true,
	snapshots: [
		{ date: "2026-01-01", value: 80 },
		{ date: "2026-01-05", value: 99 },
	],
	positions: [
		{
			id: "synthetic",
			label: "Synthetic USD fund",
			quoteCurrency: "USD",
			currentQuantity: 1,
			anchorDate: "2026-01-01",
			annualExpenseRatio: 0.01,
			priceSource: "Synthetic example, unadjusted closes",
			prices: [
				{ date: "2026-01-01", value: 100 },
				{ date: "2026-01-05", value: 110 },
			],
			fxSource: "Synthetic example, GBP per USD",
			fxRates: [
				{ date: "2026-01-01", value: 0.8 },
				{ date: "2026-01-05", value: 0.9 },
			],
		},
	],
	effects: [
		{
			id: "opening",
			holdingId: "synthetic",
			date: "2026-01-01",
			type: "buy",
			quantity: 1,
		},
	],
	cashFlows: [],
	recordedCosts: [],
};

const result = evaluatePerformance(request);
assert.equal(result.status, "available");
const calculation = result.calculation;
assert.ok(calculation);
assert.ok(Math.abs(calculation.wealthBridge.localPrice - 8.5) < 1e-10);
assert.ok(Math.abs(calculation.wealthBridge.quoteFx - 10.5) < 1e-10);
const saved = JSON.stringify(result.snapshot);
assert.deepEqual(replayPerformance(JSON.parse(saved)), result);

console.log(
	JSON.stringify(
		{
			data: "synthetic",
			status: result.status,
			reportingCurrency: result.reportingCurrency,
			returnFraction: calculation.timeWeightedReturn.twr,
			localPrice: calculation.wealthBridge.localPrice,
			quoteFx: calculation.wealthBridge.quoteFx,
			coverageFraction: calculation.coverage.fraction,
			fundCostEstimate: calculation.fundCostEstimate,
			replayMatches: true,
		},
		null,
		2,
	),
);
