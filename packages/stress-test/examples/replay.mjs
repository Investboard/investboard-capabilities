import assert from "node:assert/strict";
import {
	BUILT_IN_SCENARIOS,
	evaluateStressScenario,
	replayStressScenario,
} from "../dist/index.js";
const scenario = BUILT_IN_SCENARIOS.find((s) => s.key === "gfc_2008");
assert(scenario);
// Synthetic investor input. Both values are already EUR, regardless of quote currency.
const holdings = ["EUR", "USD"].map((currency) => ({
	holdingId: currency,
	isin: "XX0000000001",
	ticker: `EXAMPLE-${currency}`,
	name: "Synthetic global fund",
	sector: "Other",
	assetClass: "equities",
	instrumentType: "fund_etf",
	currentValue: 100,
	currency,
}));
const result = evaluateStressScenario({
	holdings,
	scenario,
	baseCurrency: "EUR",
});
assert.equal(result.status, "partial");
assert.deepEqual(
	result.calculation.holdingImpacts.map((h) => h.postStressValue),
	[43, 43],
);
assert.deepEqual(
	replayStressScenario(JSON.parse(JSON.stringify(result.snapshot))),
	result,
);
console.log(
	JSON.stringify(
		{
			interpretation: result.interpretation,
			status: result.status,
			reportingCurrency: result.baseCurrency,
			postStressValues: result.calculation.holdingImpacts.map(
				(h) => h.postStressValue,
			),
			reasons: result.reasonCodes,
			replayMatches: true,
		},
		null,
		2,
	),
);
