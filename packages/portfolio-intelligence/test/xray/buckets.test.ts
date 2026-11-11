import { describe, expect, it } from "vitest";
import {
	assetClassBuckets,
	currencyBuckets,
} from "../../src/internal/xray/buckets.js";
import { dissolveEtfs } from "../../src/internal/xray/dissolve.js";
import { mergeByIdentity } from "../../src/internal/xray/merge.js";
import { DIRECT_AAPL, DIRECT_GOLD, WRLD } from "./fixtures.js";
describe("assetClassBuckets", () => {
	it("groups merged positions by class; weights are fractions of valuedTotal", () => {
		const { exposures } = dissolveEtfs([WRLD]);
		const total = 10000 + 5000 + 50000;
		const merged = mergeByIdentity(
			[DIRECT_AAPL, DIRECT_GOLD],
			exposures,
			total,
		);
		const { coverage, buckets } = assetClassBuckets(merged, total);
		expect(coverage).toBe(1);
		const equities = buckets.find((b) => b.key === "equities")!;
		const gold = buckets.find((b) => b.key === "gold")!;
		expect(gold.weight).toBeCloseTo(5000 / total, 4);
		expect(equities.value + gold.value).toBeCloseTo(total, 1);
		expect(buckets[0]!.weight).toBeGreaterThanOrEqual(buckets.at(-1)!.weight);
	});
	it("caps contributors at 5 with a contributorsTail", () => {
		const merged = Array.from({ length: 8 }, (_, i) => ({
			id: `ticker:T${i}`,
			isin: null,
			ticker: `T${i}`,
			name: `Pos ${i}`,
			value: 100,
			weight: 0.125,
			assetClass: "equities",
			provenance: { direct: 0.125, viaFunds: [] },
		}));
		const { buckets } = assetClassBuckets(merged, 800);
		expect(buckets[0]!.contributors).toHaveLength(5);
		expect(buckets[0]!.contributorsTail).toEqual({
			count: 3,
			weight: expect.closeTo(0.375, 4),
		});
	});
	it("reconciles top-5 weights + tail weight exactly to the bucket weight (rounding bites)", () => {
		const value = 100 / 3;
		const valuedTotal = 7 * value;
		const merged = Array.from({ length: 7 }, (_, i) => ({
			id: `ticker:T${i}`,
			isin: null,
			ticker: `T${i}`,
			name: `Pos ${i}`,
			value,
			weight: Number((value / valuedTotal).toFixed(4)),
			assetClass: "equities",
			provenance: { direct: value / valuedTotal, viaFunds: [] },
		}));
		const { buckets } = assetClassBuckets(merged, valuedTotal);
		const bucket = buckets[0]!;
		expect(bucket.contributorsTail).not.toBeNull();
		const topWeightSum = bucket.contributors.reduce((s, c) => s + c.weight, 0);
		const reconciled = Number(
			(topWeightSum + bucket.contributorsTail!.weight).toFixed(4),
		);
		expect(reconciled).toBe(bucket.weight);
	});
	it("returns an empty bucket list for empty input", () => {
		expect(assetClassBuckets([], 1000)).toEqual({ coverage: 1, buckets: [] });
	});
});
describe("currencyBuckets", () => {
	it("buckets HOLDINGS by listing currency (never pro-rated through ETFs)", () => {
		const { buckets } = currencyBuckets(
			[
				{
					id: "ticker:WRLD.DE",
					name: "Synthetic All-World",
					isin: null,
					currency: "EUR",
					value: 50000,
				},
				{
					id: "isin:US1111111005",
					name: "Alder Inc.",
					isin: "US1111111005",
					currency: "USD",
					value: 10000,
				},
			],
			60000,
		);
		expect(buckets.map((b) => b.key)).toEqual(["EUR", "USD"]);
		expect(buckets[0]!.weight).toBeCloseTo(50000 / 60000, 4);
	});
	it("yields zero weights when valuedTotal is 0 (no division, no fabricated number)", () => {
		const { buckets } = currencyBuckets(
			[
				{
					id: "isin:US1111111005",
					name: "Alder Inc.",
					isin: "US1111111005",
					currency: "USD",
					value: 100,
				},
			],
			0,
		);
		expect(buckets).toHaveLength(1);
		expect(buckets[0]!.weight).toBe(0);
		expect(buckets[0]!.contributors[0]!.weight).toBe(0);
	});
});
