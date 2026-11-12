import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	analyzePortfolio,
	measureCorrelations,
	replayCorrelations,
	replayPortfolioAnalysis,
} from "../dist/index.js";

// Entirely synthetic portfolios, companies, funds and prices. No provider access.
const book = (name) =>
	JSON.parse(
		readFileSync(new URL(`../parity/${name}.json`, import.meta.url), "utf8"),
	);
const pct = (weight) => `${(weight * 100).toFixed(1)}%`;

// Two world funds that share companies, one company also held directly, and cash.
const world = book("world-pair");
const result = analyzePortfolio(world.request);

console.log("What the portfolio really owns (share of the whole portfolio)");
for (const p of result.positions
	.filter((p) => !p.residual)
	.sort((a, b) => b.weight - a.weight)
	.slice(0, 5)) {
	const via = p.viaFunds
		.map((v) => `${v.holdingId} ${pct(v.weight)}`)
		.join(", ");
	console.log(
		`  ${p.name.padEnd(22)} ${pct(p.weight).padStart(6)}  direct ${pct(p.direct)}${via ? `, via ${via}` : ""}`,
	);
}
const alder = result.positions.find((p) => p.name === "Alder Inc.");
assert.equal(alder.weight.toFixed(4), "0.2900");
assert.equal(alder.direct.toFixed(4), "0.0500");

console.log(
	"\nBasis by holding:",
	result.basis.map((b) => `${b.key} ${pct(b.weight)}`).join(", "),
);
assert.deepEqual(
	result.basis.map((b) => [b.key, b.weight.toFixed(2)]),
	[
		["equities", "0.95"],
		["cash", "0.05"],
	],
);

const [pair] = result.overlap;
console.log(
	`Fund overlap ${pair.fundA} and ${pair.fundB}: ${pct(pair.overlap)}`,
);
assert.equal(pair.overlap.toFixed(2), "0.76");

console.log("Currency estimate qualification:", result.dimensions.economicCurrency.qualification);
console.log("Source-backed currency status:", result.dimensions.reportedEconomicCurrency.status);
assert.equal(result.dimensions.economicCurrency.qualification.stressUse, "ineligible");
assert.equal(result.dimensions.reportedEconomicCurrency.status, "unavailable");

// Synthetic caller-source evidence is separate from the country/name estimate.
const sourced = structuredClone(world.request);
sourced.holdings[0].currencyEvidence = {
  exposure: {
    basis: "reported_economic_exposure",
    source: { reference: "synthetic:exposure", asOf: "2026-09-30" },
    buckets: [{ key: "EUR", weight: 0 }, { key: "JPY", weight: 0.75 }],
  },
  hedge: {
    basis: "reported_hedge_policy", status: "unhedged",
    source: { reference: "synthetic:policy", asOf: "2026-09-30" },
  },
};
console.log("Source-backed model (not independently verified):", analyzePortfolio(sourced).dimensions.reportedEconomicCurrency);

const { hhi, effectiveIssuers, attributedCoverage } = result.concentration;
console.log(
	`Concentration over ${pct(attributedCoverage)} of the equity part: index ${hhi.value.toFixed(3)} (${hhi.bound} bound), about ${effectiveIssuers.value.toFixed(1)} effective companies (${effectiveIssuers.bound} bound)`,
);
assert.equal(hhi.bound, "lower");

const fiveYears = measureCorrelations(world.correlation).windows.find(
	(w) => w.window === "5y",
);
assert.equal(fiveYears.status, "available");
console.log(
	`Five-year weekly correlation, value-weighted mean: ${fiveYears.weightedMeanCorrelation.toFixed(2)}`,
);

// A partly listed fund, a fund with no list and a holding that could not be valued.
const partial = analyzePortfolio(book("partial").request);
console.log(
	`\nIncomplete data stays visible: status ${partial.status} (${partial.reasonCodes.join(", ")}), pending ${pct(partial.coverage.opaquePending)}, unvalued ${partial.valuation.unvalued.map((u) => u.name).join(", ")}`,
);
assert.equal(partial.status, "partial");
assert.equal(partial.coverage.opaquePending.toFixed(2), "0.30");

assert.deepEqual(replayPortfolioAnalysis(result.snapshot), result);
assert.deepEqual(
	replayCorrelations(measureCorrelations(world.correlation).snapshot).windows,
	measureCorrelations(world.correlation).windows,
);
console.log("\nBoth saved snapshots replay to the same results.");
