import { expect, it } from "vitest";
import { analyzePortfolio, type HoldingInput } from "../src/index.js";

const base = { asOf: "2026-01-30", baseCurrency: "EUR" };
const first: HoldingInput = {
	id: "first",
	isin: "IESYN6451620",
	ticker: "FUND",
	kind: "fund",
	name: "First fund",
	value: 100,
	listingCurrency: "EUR",
	assetClass: "equities",
};
const second: HoldingInput = {
	...first,
	id: "second",
	isin: "IESYN4303130",
	name: "Second fund",
};
const share = {
	id: "A",
	isin: "DESYN1234560",
	name: "Alpha ordinary",
	weight: 0.75,
};

it("uses one effective fund weight for holdings, overlap and sector coverage", () => {
	const result = analyzePortfolio({
		...base,
		holdings: [first, second],
		funds: [
			{
				holdingId: "first",
				holdings: {
					status: "listed",
					asOf: base.asOf,
					constituents: [
						share,
						{ id: "B", name: "Other company", weight: 0.75 },
					],
				},
			},
			{
				holdingId: "second",
				holdings: {
					status: "listed",
					asOf: base.asOf,
					constituents: [{ ...share, weight: 0.8 }],
				},
			},
		],
		securities: [{ isin: share.isin, sector: "technology", country: "DE" }],
	});
	const row = result.positions.find((p) => p.isin === share.isin)!;
	expect(row.value).toBe(130);
	expect(result.overlap[0]?.overlap).toBe(0.5);
	expect(result.overlap[0]?.shared[0]?.weightInA).toBe(0.5);
	expect(result.dimensions.sector.coverage).toBe(0.65);
	expect(result.dimensions.country.coverage).toBe(0.65);
	expect(
		result.positions
			.filter((p) => p.residual)
			.reduce((total, p) => total + p.value, 0),
	).toBeCloseTo(20, 12);
	expect(result.concentration.attributedCoverage).toBe(0.9);
	expect(result.concentration.hhi?.value).toBeCloseTo(0.485, 14);
	expect(result.concentration.effectiveIssuers?.value).toBeCloseTo(
		1 / 0.485,
		14,
	);
	expect(result.concentration.effectiveIssuers?.bound).toBe("upper");
});

it("keeps the unresolved holdings of two distinct funds with the same ticker separate", () => {
	const result = analyzePortfolio({
		...base,
		holdings: [first, second],
		funds: [first, second].map((h) => ({
			holdingId: h.id,
			holdings: {
				status: "listed",
				asOf: base.asOf,
				constituents: [{ ...share, weight: h.id === "first" ? 0.6 : 0.2 }],
			},
		})),
	});
	const residuals = result.positions.filter((p) => p.residual);
	expect(
		residuals.map((p) => [p.viaFunds.map((f) => f.holdingId), p.value]),
	).toEqual([
		[["second"], 80],
		[["first"], 40],
	]);
	expect(new Set(residuals.map((p) => p.id)).size).toBe(2);
	expect(result.concentration.attributedCoverage).toBe(0.4);
});

it("uses the supplied issuer identity across listings while preserving exposure to each security", () => {
	const holdings = [
		{
			...first,
			kind: "security" as const,
			id: "ordinary",
			name: "Alpha ordinary",
		},
		{
			...second,
			kind: "security" as const,
			id: "preferred",
			name: "Alpha preference",
		},
	];
	const result = analyzePortfolio({
		...base,
		holdings,
		securities: holdings.map((h) => ({
			isin: h.isin!,
			name: h.name,
			issuerName: "Alpha Industries",
		})),
	});
	expect(result.positions).toHaveLength(2);
	expect(result.issuers).toHaveLength(1);
	expect(result.concentration.largestIssuer).toMatchObject({
		name: "Alpha Industries",
		weight: 1,
	});
	expect(result.concentration.hhi).toEqual({ value: 1, bound: "exact" });
});

it("returns all position IDs contributing to a grouped issuer value", () => {
	const result = analyzePortfolio({
		...base,
		holdings: [
			first,
			{
				...second,
				kind: "security",
				isin: share.isin,
				name: share.name,
				assetClass: "real_estate",
			},
		],
		funds: [
			{
				holdingId: first.id,
				holdings: {
					status: "listed",
					asOf: base.asOf,
					constituents: [{ ...share, weight: 1 }],
				},
			},
		],
	});
	const g = result.issuers[0]!;
	expect(g.positionIds).toHaveLength(2);
	expect(
		result.positions
			.filter((p) => g.positionIds.includes(p.id))
			.reduce((s, p) => s + p.value, 0),
	).toBe(g.value);
});
