import assert from "node:assert/strict";
import {
	compareRebalance,
	projectContributions,
	replayRebalanceComparison,
} from "../dist/index.js";

// Synthetic book. Every amount, including supplied taxes, is already in EUR.
const policy = {
	equities: { min: 0.55, target: 0.6, max: 0.65 },
	bonds: { min: 0.35, target: 0.4, max: 0.45 },
};
const result = compareRebalance({
	baseCurrency: "EUR",
	holdings: [
		{
			holdingId: "equity",
			depotId: "A",
			assetClass: "equities",
			value: 70000,
			currency: "EUR",
		},
		{
			holdingId: "bond",
			depotId: "A",
			assetClass: "bonds",
			value: 30000,
			currency: "EUR",
		},
	],
	policy,
	contribution: 100000,
	cashLimit: 1000,
	fundingDepotId: "A",
	accounts: [
		{ depotId: "A", feePerTrade: 0, minimum: 0, maximum: 0, increment: 0.01 },
	],
});
const fresh = result.alternatives.find((a) => a.kind === "fresh_cash");
assert.equal(fresh.valueAfter, 200000);
assert.equal(fresh.residualDrift, 0);
assert.deepEqual(
	fresh.purchases.map((p) => [p.assetClass, p.amount]),
	[
		["bonds", 50000],
		["equities", 50000],
	],
);
assert.deepEqual(
	replayRebalanceComparison(JSON.parse(JSON.stringify(result.snapshot))),
	result,
);

const funding = compareRebalance({
	baseCurrency: "EUR",
	contribution: 0,
	cashLimit: 0,
	fundingDepotId: "A",
	policy: Object.fromEntries(
		["equities", "bonds", "gold", "crypto"].map((k) => [
			k,
			{ min: 0, target: 0.25, max: 1 },
		]),
	),
	holdings: [
		{
			holdingId: "sale-A",
			depotId: "A",
			assetClass: "equities",
			value: 200,
			currency: "EUR",
		},
		{
			holdingId: "buy-A",
			depotId: "A",
			assetClass: "bonds",
			value: 10,
			currency: "EUR",
		},
		{
			holdingId: "sale-B",
			depotId: "B",
			assetClass: "gold",
			value: 200,
			currency: "EUR",
		},
		{
			holdingId: "buy-B",
			depotId: "B",
			assetClass: "crypto",
			value: 10,
			currency: "EUR",
		},
	],
	accounts: ["A", "B"].map((depotId) => ({
		depotId,
		feePerTrade: 0,
		minimum: 0,
		maximum: 0,
		increment: 0.01,
	})),
	salePlan: {
		sales: [
			{
				holdingId: "sale-A",
				amount: 100,
				tax: { amount: 26.38, source: "Synthetic caller estimate" },
			},
			{
				holdingId: "sale-B",
				amount: 100,
				tax: { amount: 0, source: "Synthetic caller estimate" },
			},
		],
		purchases: [
			{ holdingId: "buy-A", depotId: "A", assetClass: "bonds", amount: 86.81 },
			{ holdingId: "buy-B", depotId: "B", assetClass: "crypto", amount: 86.81 },
		],
	},
}).alternatives.find((a) => a.kind === "sales");
assert.equal(funding.feasibility, "conditional");
assert.equal(
	funding.funding.find((f) => f.depotId === "A").transferRequired,
	13.19,
);

const projection = projectContributions({
	positions: [
		{ assetClass: "equities", value: 70000 },
		{ assetClass: "bonds", value: 30000 },
	],
	policy,
	monthlyContribution: 100,
	months: 12,
	minTradeSize: 1000,
	annualReturns: { equities: 0, bonds: 0, cash: 0 },
});
assert.equal(projection.timeline.at(-1).value, 101200);
assert(projection.timeline.every((month) => month.allocations.length === 0));

console.log(
	JSON.stringify(
		{
			module: "@investboard/rebalancing",
			freshCash: {
				purchases: fresh.purchases,
				valueAfter: fresh.valueAfter,
				residualDrift: fresh.residualDrift,
			},
			suppliedSales: {
				feasibility: funding.feasibility,
				funding: funding.funding,
			},
			belowMinimumProjection: {
				months: 12,
				finalValue: projection.timeline.at(-1).value,
				newContributionsRetained: 1200,
			},
			replayMatches: true,
		},
		null,
		2,
	),
);
