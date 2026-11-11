import { describe, expect, it } from "vitest";
import {
	classificationBuckets,
	regionBucketsFromCountry,
} from "../../src/internal/xray/classification-buckets.js";
const etf = (
	value: number,
	vector:
		| {
				key: string;
				weight: number;
		  }[]
		| null,
) => ({ value, vector });
const direct = (value: number, key: string | null) => ({ value, key });
describe("classificationBuckets", () => {
	it("pro-rates ETF vectors by ETF value and adds direct holdings by own key", () => {
		const r = classificationBuckets({
			etfs: [
				etf(60000, [
					{ key: "technology", weight: 0.7 },
					{ key: "financials", weight: 0.3 },
				]),
			],
			direct: [direct(40000, "technology")],
			totalValue: 100000,
		});
		const tech = r.buckets.find((b) => b.key === "technology");
		const fin = r.buckets.find((b) => b.key === "financials");
		expect(tech?.value).toBeCloseTo(82000, 2);
		expect(tech?.weight).toBeCloseTo(0.82, 6);
		expect(fin?.value).toBeCloseTo(18000, 2);
		expect(r.coverage).toBeCloseTo(1, 6);
	});
	it("an ETF WITHOUT a vector lands entirely in the unknown bucket, never silently dropped, never guessed", () => {
		const r = classificationBuckets({
			etfs: [etf(50000, null)],
			direct: [direct(50000, "energy")],
			totalValue: 100000,
		});
		const unknown = r.buckets.find((b) => b.key === "unknown");
		expect(unknown?.value).toBeCloseTo(50000, 2);
		expect(r.coverage).toBeCloseTo(0.5, 6);
	});
	it("a vector summing under 1 puts the ETF's uncovered remainder in unknown (value conservation)", () => {
		const r = classificationBuckets({
			etfs: [etf(100000, [{ key: "technology", weight: 0.9 }])],
			direct: [],
			totalValue: 100000,
		});
		const tech = r.buckets.find((b) => b.key === "technology");
		const unknown = r.buckets.find((b) => b.key === "unknown");
		expect(tech?.value).toBeCloseTo(90000, 2);
		expect(unknown?.value).toBeCloseTo(10000, 2);
		const sum = r.buckets.reduce((s, b) => s + b.value, 0);
		expect(sum).toBeCloseTo(100000, 2);
	});
	it("a vector summing OVER 1 (provider noise) is rescaled to 1, never inflating value", () => {
		const r = classificationBuckets({
			etfs: [
				etf(100000, [
					{ key: "technology", weight: 0.6 },
					{ key: "financials", weight: 0.6 },
				]),
			],
			direct: [],
			totalValue: 100000,
		});
		const sum = r.buckets.reduce((s, b) => s + b.value, 0);
		expect(sum).toBeCloseTo(100000, 2);
		expect(r.buckets.find((b) => b.key === "technology")?.value).toBeCloseTo(
			50000,
			2,
		);
	});
	it("direct holding with null key lands in unknown; zero totalValue yields empty buckets, coverage 0, no NaN", () => {
		const r0 = classificationBuckets({
			etfs: [],
			direct: [direct(10000, null)],
			totalValue: 10000,
		});
		expect(r0.buckets.find((b) => b.key === "unknown")?.value).toBeCloseTo(
			10000,
			2,
		);
		const rz = classificationBuckets({
			etfs: [],
			direct: [],
			totalValue: 0,
		});
		expect(rz.buckets).toEqual([]);
		expect(rz.coverage).toBe(0);
		expect(Number.isFinite(rz.coverage)).toBe(true);
	});
	it("F8: a NON-FINITE direct value (NaN / Infinity) is skipped, no NaN bucket, coverage stays finite", () => {
		const r = classificationBuckets({
			etfs: [],
			direct: [
				direct(60000, "technology"),
				direct(Number.NaN, "financials"),
				direct(Number.POSITIVE_INFINITY, "energy"),
			],
			totalValue: 100000,
		});
		expect(r.buckets.find((b) => b.key === "technology")?.value).toBeCloseTo(
			60000,
			2,
		);
		expect(r.buckets.find((b) => b.key === "financials")).toBeUndefined();
		expect(r.buckets.find((b) => b.key === "energy")).toBeUndefined();
		for (const b of r.buckets) {
			expect(Number.isFinite(b.value)).toBe(true);
			expect(Number.isFinite(b.weight)).toBe(true);
		}
		expect(Number.isFinite(r.coverage)).toBe(true);
		expect(r.buckets.find((b) => b.key === "technology")?.weight).toBeCloseTo(
			0.6,
			6,
		);
	});
	it("an uncovered remainder BELOW the residual floor mints NO unknown bucket; just above it DOES", () => {
		const below = classificationBuckets({
			etfs: [etf(1, [{ key: "technology", weight: 0.999 }])],
			direct: [],
			totalValue: 1,
		});
		expect(below.buckets.find((b) => b.key === "unknown")).toBeUndefined();
		const above = classificationBuckets({
			etfs: [etf(100, [{ key: "technology", weight: 0.99 }])],
			direct: [],
			totalValue: 100,
		});
		expect(above.buckets.find((b) => b.key === "unknown")?.value).toBeCloseTo(
			1,
			2,
		);
	});
	it("buckets sort weight-descending with unknown LAST regardless of size", () => {
		const r = classificationBuckets({
			etfs: [etf(80000, null)],
			direct: [direct(20000, "energy")],
			totalValue: 100000,
		});
		expect(r.buckets[r.buckets.length - 1]?.key).toBe("unknown");
	});
});
describe("regionBucketsFromCountry", () => {
	it("folds country buckets into regions; unknown carries through, unmapped ISO → other, never merging the two", () => {
		const country = classificationBuckets({
			etfs: [],
			direct: [
				direct(50000, "US"),
				direct(20000, "DE"),
				direct(10000, "ZZ"),
				direct(20000, null),
			],
			totalValue: 100000,
		});
		const r = regionBucketsFromCountry(country, 100000);
		const na = r.buckets.find((b) => b.key === "northAmerica");
		const eu = r.buckets.find((b) => b.key === "europe");
		const other = r.buckets.find((b) => b.key === "other");
		const unknown = r.buckets.find((b) => b.key === "unknown");
		expect(na?.value).toBeCloseTo(50000, 2);
		expect(eu?.value).toBeCloseTo(20000, 2);
		expect(other?.value).toBeCloseTo(10000, 2);
		expect(unknown?.value).toBeCloseTo(20000, 2);
		expect(r.coverage).toBeCloseTo(0.8, 6);
		expect(r.buckets[r.buckets.length - 1]?.key).toBe("unknown");
		const sum = r.buckets.reduce((s, b) => s + b.value, 0);
		expect(sum).toBeCloseTo(100000, 2);
	});
	it("a PARTIALLY-VALUED country pass keeps region weights/coverage against the SAME denominator (caller contract)", () => {
		const country = classificationBuckets({
			etfs: [],
			direct: [direct(60000, "US"), direct(20000, null)],
			totalValue: 100000,
		});
		expect(country.buckets.reduce((s, b) => s + b.value, 0)).toBeCloseTo(
			80000,
			2,
		);
		expect(country.coverage).toBeCloseTo(0.6, 6);
		const r = regionBucketsFromCountry(country, 100000);
		const na = r.buckets.find((b) => b.key === "northAmerica");
		const unknown = r.buckets.find((b) => b.key === "unknown");
		expect(na?.weight).toBeCloseTo(0.6, 6);
		expect(unknown?.weight).toBeCloseTo(0.2, 6);
		expect(na?.value).toBeCloseTo(60000, 2);
		expect(unknown?.value).toBeCloseTo(20000, 2);
		expect(r.coverage).toBeCloseTo(0.6, 6);
	});
	it("multiple countries in the same region accumulate into one region bucket", () => {
		const country = classificationBuckets({
			etfs: [],
			direct: [direct(30000, "DE"), direct(20000, "FR")],
			totalValue: 50000,
		});
		const r = regionBucketsFromCountry(country, 50000);
		const eu = r.buckets.find((b) => b.key === "europe");
		expect(eu?.value).toBeCloseTo(50000, 2);
		expect(r.coverage).toBeCloseTo(1, 6);
	});
	it("zero totalValue yields empty buckets, coverage 0, no NaN", () => {
		const country = classificationBuckets({
			etfs: [],
			direct: [],
			totalValue: 0,
		});
		const r = regionBucketsFromCountry(country, 0);
		expect(r.buckets).toEqual([]);
		expect(r.coverage).toBe(0);
		expect(Number.isFinite(r.coverage)).toBe(true);
	});
});
