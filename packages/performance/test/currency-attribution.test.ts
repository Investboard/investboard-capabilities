// Synthetic regression fixtures. Copyright 2026 Investboard GmbH. Apache-2.0
import { describe, expect, it } from "vitest";
import { aggregateCurrencyAttribution } from "../src/internal/performance/currency-attribution.js";
const holding = (
	id: string,
	contribution: number,
	endWeightPct: number | null,
) => ({
	id,
	label: id.toUpperCase(),
	startWeightPct: endWeightPct,
	endWeightPct,
	contribution,
	contributionPp: contribution * 100,
});
describe("currency attribution", () => {
	it("groups quote currencies and reconciles every holding contribution", () => {
		const result = aggregateCurrencyAttribution({
			holdings: [
				holding("a", 0.05, 30),
				holding("b", -0.01, 20),
				holding("c", 0.02, 25),
			],
			classifications: [
				{ holdingId: "a", currency: "usd" },
				{ holdingId: "b", currency: " USD " },
				{ holdingId: "c", currency: "EUR" },
			],
		});
		expect(result).toMatchObject({
			methodology: "attributed_price_series_currency",
			rows: [
				{
					key: "USD",
					kind: "currency",
					holdingCount: 2,
					endWeightPct: 50,
					contribution: 0.04,
				},
				{
					key: "EUR",
					kind: "currency",
					holdingCount: 1,
					endWeightPct: 25,
					contribution: 0.02,
				},
			],
		});
		expect(result.reconciliationGap).toBeCloseTo(0, 12);
	});
	it("keeps missing currency metadata explicit", () => {
		const result = aggregateCurrencyAttribution({
			holdings: [holding("a", 0.03, 100)],
			classifications: [{ holdingId: "a", currency: null }],
		});
		expect(result.rows[0]).toMatchObject({
			key: "unknown",
			kind: "unclassified",
			contribution: 0.03,
		});
	});
});
