import { describe, expect, it } from "vitest";
import {
	classificationBuckets,
	regionBucketsFromCountry,
} from "../../src/internal/xray/classification-buckets.js";
const source = (id: string, label = id) => ({ id, label, isin: null });
describe("classification attribution", () => {
	it("values contributions on the same base and merges one instrument's account lots", () => {
		const result = classificationBuckets({
			totalValue: 1000,
			etfs: [100, 200].map((value) => ({
				value,
				source: source("fund:A"),
				vector: [
					{ key: "US", weight: 0.6 },
					{ key: "DE", weight: 0.2 },
				],
			})),
			direct: [{ value: 100, key: "US", source: source("stock:A") }],
		});
		const us = result.buckets.find((row) => row.key === "US");
		expect(us?.value).toBe(280);
		expect(us?.contributors).toEqual([
			{ ...source("fund:A"), weight: 0.18 },
			{ ...source("stock:A"), weight: 0.1 },
		]);
		expect(
			result.buckets.find((row) => row.key === "unknown")?.value,
		).toBeCloseTo(60, 12);
		const region = regionBucketsFromCountry(result, 1000);
		expect(
			region.buckets.find((row) => row.key === "northAmerica")?.contributors
				?.length,
		).toBe(2);
	});
	it("retains over-100 vector scaling, exact tails and separate same-name identities", () => {
		const result = classificationBuckets({
			totalValue: 700,
			etfs: [
				{
					value: 100,
					source: source("fund", "Same name"),
					vector: [
						{ key: "US", weight: 1.2 },
						{ key: "DE", weight: 0.8 },
					],
				},
			],
			direct: Array.from({ length: 6 }, (_, i) => ({
				value: 100,
				key: "US",
				source: source(`stock:${i}`, "Same name"),
			})),
		});
		const us = result.buckets.find((row) => row.key === "US");
		expect(us?.value).toBe(660);
		expect(us?.contributors).toHaveLength(5);
		expect(us?.contributorsTail?.count).toBe(2);
		expect(
			(us?.contributors?.reduce((sum, row) => sum + row.weight, 0) ?? 0) +
				(us?.contributorsTail?.weight ?? 0),
		).toBeCloseTo(660 / 700, 12);
		expect(
			regionBucketsFromCountry(result, 700).buckets.find(
				(row) => row.key === "northAmerica",
			)?.contributors,
		).toBeUndefined();
	});
	it("keeps legacy inputs without identity valid without inventing attribution", () => {
		expect(
			classificationBuckets({
				totalValue: 100,
				etfs: [],
				direct: [{ value: 100, key: "US" }],
			}).buckets,
		).toEqual([{ key: "US", value: 100, weight: 1 }]);
	});
});
