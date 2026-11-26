import { describe, expect, it } from "vitest";
import {
	analyzePortfolio,
	measureCorrelations,
	replayPortfolioAnalysis,
	replayCorrelations,
	type HoldingInput,
	type CorrelationRequest,
} from "../src/index.js";

const asOf = "2025-07-12";
const baseCurrency = "EUR";
const fund: HoldingInput = {
	id: "broad",
	kind: "fund",
	name: "Broad synthetic equity fund",
	assetClass: "equities",
	listingCurrency: "EUR",
	value: 9000,
};
const cash: HoldingInput = {
	id: "cash",
	kind: "cash",
	name: "Cash",
	assetClass: "cash",
	listingCurrency: "EUR",
	value: 1000,
};

it("reconciles a broad fund, its residual and cash without rounding away small positions", () => {
	const constituents = Array.from({ length: 1248 }, (_, i) => ({
		id: `issuer-${i}`,
		name: `Synthetic issuer ${i}`,
		weight: i < 64 ? 0.0000301234 : 0.000813267,
	}));
	const result = analyzePortfolio({
		asOf,
		baseCurrency,
		holdings: [fund, cash],
		funds: [
			{
				holdingId: fund.id,
				reportedClass: "equities",
				holdings: { status: "listed", asOf, constituents },
			},
		],
	});
	expect(result.positions).toHaveLength(1250);
	const byId = new Map(result.positions.map((p) => [p.id, p]));
	for (const input of constituents) {
		const row = byId.get(`ticker:${input.id.toUpperCase()}`)!;
		const value = input.weight * 9000;
		expect(row.value).toBe(value);
		expect(row.weight).toBe(value / 10000);
		expect(row.viaFunds).toMatchObject([
			{ shareInFund: input.weight, weight: value / 10000 },
		]);
	}
	const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
	expect(sum(result.positions.map((p) => p.value))).toBeCloseTo(10000, 8);
	expect(sum(result.positions.map((p) => p.weight))).toBeCloseTo(1, 12);
	const residual = result.positions.find((p) => p.residual)!;
	expect(residual.value).toBeCloseTo(
		9000 * (1 - 64 * 0.0000301234 - 1184 * 0.000813267),
		10,
	);
	const referenceHHI = 64 * 0.0000301234 ** 2 + 1184 * 0.000813267 ** 2;
	expect(result.concentration.hhi?.value).toBeCloseTo(referenceHHI, 13);
	expect(result.concentration.hhi?.bound).toBe("lower");
	expect(replayPortfolioAnalysis(result.snapshot)).toEqual(result);
	expect(() =>
		replayPortfolioAnalysis({
			...result.snapshot,
			methodologyVersion: "portfolio-intelligence-v3",
		}),
	).toThrow(/original package/);
});

it("adds duplicate share disclosures from one fund before reporting their source weight", () => {
	const asOf = "2025-01-31";
	const result = analyzePortfolio({
		asOf,
		baseCurrency,
		holdings: [fund, cash],
		funds: [
			{
				holdingId: fund.id,
				reportedClass: "equities",
				holdings: {
					status: "listed",
					asOf,
					constituents: [
						{ id: "A", name: "One company", weight: 0.00002 },
						{ id: "A", name: "One company", weight: 0.00003 },
					],
				},
			},
		],
	});
	const row = result.positions.find((p) => p.id === "ticker:A")!;
	expect(row.value).toBeCloseTo(0.45, 14);
	expect(row.weight).toBeCloseTo(0.000045, 15);
	expect(row.viaFunds).toHaveLength(1);
	expect(row.viaFunds[0]?.shareInFund).toBeCloseTo(0.00005, 16);
});

describe("issuer disclosure", () => {
	const read = (known: number, missing: number) =>
		analyzePortfolio({
			asOf,
			baseCurrency,
			holdings: [
				{
					...fund,
					kind: "security",
					id: "issuer",
					name: "Measured company",
					value: known,
				},
				{ ...fund, value: missing },
			],
			funds: [
				{
					holdingId: fund.id,
					reportedClass: "equities",
					holdings: { status: "missing" },
				},
			],
		}).concentration;
	it.each([
		0.5, 0.7999999,
	])("discloses the measured issuer at %d coverage without inferring portfolio statistics", (fraction) => {
		const result = read(fraction * 10000, (1 - fraction) * 10000);
		expect(result.status).toBe("refused");
		expect(result.largestIssuer?.weight).toBeCloseTo(fraction, 14);
		expect(result.hhi).toBeNull();
		expect(result.effectiveIssuers).toBeNull();
	});
	it("keeps the largest observed issuer when no individual position exceeds ten percent", () => {
		const result = analyzePortfolio({
			asOf,
			baseCurrency,
			holdings: [
				...Array.from({ length: 5 }, (_, i) => ({
					id: `issuer-${i}`,
					name: `Company ${i}`,
					kind: "security" as const,
					assetClass: "equities" as const,
					listingCurrency: "EUR",
					value: 1000,
				})),
				{ ...fund, value: 5000 },
			],
			funds: [
				{
					holdingId: fund.id,
					reportedClass: "equities",
					holdings: { status: "missing" },
				},
			],
		});
		expect(result.concentration.attributedCoverage).toBe(0.5);
		expect(result.concentration.largestIssuer?.weight).toBe(0.1);
		expect(result.concentration.hhi).toBeNull();
		expect(result.concentration.effectiveIssuers).toBeNull();
	});
	it("uses bounds from the inclusive floor until attribution is actually complete", () => {
		const result = read(8000, 2000);
		expect(result.hhi?.bound).toBe("lower");
		expect(result.hhi?.value).toBeCloseTo(0.64, 14);
		expect(result.effectiveIssuers?.bound).toBe("upper");
		expect(result.effectiveIssuers?.value).toBeCloseTo(1.5625, 14);
		expect(read(10000, 1e-10).hhi?.bound).toBe("lower");
		expect(read(10000, 0).hhi).toEqual({ value: 1, bound: "exact" });
	});
});

it("retains only supported dated pairs when a whole-book weight is unknown", () => {
	const holdings: CorrelationRequest["holdings"] = [
		{ id: "A", value: 200, priceCurrency: "EUR", closeBasis: "price" },
		{ id: "B", value: 300, priceCurrency: "EUR" },
		{ id: "C", value: null, priceCurrency: "EUR", closeBasis: "total_return" },
	];
	const closes: CorrelationRequest["closes"] = [];
	let first = 100,
		second = 100;
	for (let k = 0; k <= 52; k++) {
		if (k > 0) {
			first *= 1 + (k % 2 ? 0.01 : -0.01);
			second *= 1 + (k % 4 < 2 ? 0.01 : -0.01);
		}
		const date = new Date(Date.UTC(2024, 6, 12) + k * 7 * 86400000)
			.toISOString()
			.slice(0, 10);
		closes.push(
			{ id: "A", date, close: first },
			{ id: "B", date, close: second },
		);
		if (k >= 8) closes.push({ id: "C", date, close: second });
	}
	const request = { asOf, baseCurrency, holdings, closes };
	const result = measureCorrelations(request);
	const window = result.windows[0]!;
	expect(window.status).toBe("partial");
	if (window.status !== "partial") throw Error("missing observed pair");
	expect(window.from).toBe("2024-07-12");
	expect(window.to).toBe("2025-07-11");
	expect(window.coverage.coveredValueShare).toBeNull();
	expect(window.weightedMeanCorrelation).toBeNull();
	expect(window.largestGroupShare).toBeNull();
	expect(window.seriesBasis).toEqual([
		{ id: "A", basis: "price" },
		{ id: "B", basis: "unspecified" },
	]);
	expect(window.pairs).toHaveLength(1);
	const pair = window.pairs[0]!;
	expect(pair).toMatchObject({ a: "A", b: "B", n: 52, band: "low_linear" });
	expect(pair.correlation).toBeCloseTo(0, 13);
	expect(pair.interval?.[0]).toBeCloseTo(-0.27290508, 7);
	expect(pair.interval?.[1]).toBeCloseTo(0.27290508, 7);
	const control = measureCorrelations({
		...request,
		holdings: holdings.slice(0, 2),
		closes: closes.filter((c) => c.id !== "C"),
	}).windows[0]!;
	expect(control.status).toBe("available");
	if (control.status !== "available") throw Error("missing control");
	expect(control.pairs).toEqual(window.pairs);
	const stale = measureCorrelations({
		...request,
		closes: closes.filter((c) => c.date !== "2025-07-11"),
	}).windows[0]!;
	expect(stale).toMatchObject({
		status: "partial",
		to: "2025-07-04",
		commonWeeks: 51,
	});
	expect(result.windows[1]?.status).toBe("insufficient_history");
	expect(replayCorrelations(result.snapshot)).toEqual(result);
	expect(() =>
		replayCorrelations({
			...result.snapshot,
			methodologyVersion: "weekly-common-sample-correlation-v1",
		}),
	).toThrow(/original package/);
});
