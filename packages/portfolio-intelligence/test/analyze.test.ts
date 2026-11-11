import { describe, expect, it } from "vitest";
import {
	analyzePortfolio,
	METHODOLOGY_VERSION,
	PortfolioInputError,
	replayPortfolioAnalysis,
} from "../src/index.js";
import type {
	FundInput,
	HoldingInput,
	PortfolioRequest,
} from "../src/index.js";

const ALDER = { id: "ALDR", isin: "US1111110005", name: "Alder Inc." };
const CEDAR = { id: "CDSF", isin: "US4444441045", name: "Cedarsoft Corp." };
const LARCH = { id: "LRH", isin: "DESYN0000030", name: "Larchhaus SE" };

function fundHolding(
	id: string,
	value: number | null,
	overrides: Partial<HoldingInput> = {},
): HoldingInput {
	return {
		id,
		kind: "fund",
		name: `Synthetic ${id} Fund`,
		isin: `IESYN${id
			.padStart(6, "0")
			.slice(-6)
			.toUpperCase()
			.replace(/[^A-Z0-9]/g, "0")}0`,
		ticker: id.toUpperCase(),
		value,
		listingCurrency: "EUR",
		assetClass: "equities",
		...overrides,
	};
}

function listed(
	holdingId: string,
	constituents: Array<{
		id: string;
		isin: string;
		name: string;
		weight: number;
	}>,
): FundInput {
	return {
		holdingId,
		holdings: { status: "listed", asOf: "2026-09-30", constituents },
	};
}

function book(overrides: Partial<PortfolioRequest> = {}): PortfolioRequest {
	return {
		asOf: "2026-10-30",
		baseCurrency: "EUR",
		holdings: [],
		securities: [
			{
				isin: ALDER.isin,
				name: ALDER.name,
				sector: "Technology",
				country: "United States",
				assetClass: "equities",
			},
			{
				isin: CEDAR.isin,
				name: CEDAR.name,
				sector: "Technology",
				country: "United States",
				assetClass: "equities",
			},
			{
				isin: LARCH.isin,
				name: LARCH.name,
				sector: "Real Estate",
				country: "Germany",
				assetClass: "equities",
			},
		],
		...overrides,
	};
}

describe("analyzePortfolio", () => {
	it("counts each fund whole in its class for the basis", () => {
		const result = analyzePortfolio(
			book({
				holdings: [
					fundHolding("world", 600),
					fundHolding("homes", 400, { assetClass: "real_estate" }),
				],
				funds: [
					listed("world", [
						{ ...LARCH, weight: 0.1 },
						{ ...ALDER, weight: 0.5 },
					]),
					listed("homes", [{ ...LARCH, weight: 0.6 }]),
				],
			}),
		);
		const basis = Object.fromEntries(
			result.basis.map((b) => [b.key, b.weight]),
		);
		expect(basis.equities).toBeCloseTo(0.6, 10);
		expect(basis.real_estate).toBeCloseTo(0.4, 10);
		expect(result.status).toBe("available");
	});

	it("never dissolves a bond fund", () => {
		const result = analyzePortfolio(
			book({
				holdings: [
					fundHolding("world", 700),
					fundHolding("bond", 300, { assetClass: "bonds" }),
				],
				funds: [
					listed("world", [{ ...ALDER, weight: 1 }]),
					listed("bond", [{ ...CEDAR, weight: 1 }]),
				],
			}),
		);
		expect(
			result.positions.some(
				(p) => !p.residual && p.viaFunds.some((v) => v.holdingId === "bond"),
			),
		).toBe(false);
		const whole = result.positions.find(
			(p) => p.residual && p.viaFunds.some((v) => v.holdingId === "bond"),
		);
		expect(whole?.assetClass).toBe("bonds");
		expect(whole?.weight).toBeCloseTo(0.3, 10);
		expect(result.positions.some((p) => p.isin === CEDAR.isin)).toBe(false);
		expect(result.basis.find((b) => b.key === "bonds")?.weight).toBeCloseTo(
			0.3,
			10,
		);
		expect(result.funds.find((f) => f.holdingId === "bond")?.treatment).toBe(
			"held_whole",
		);
	});

	it("keeps a fund with a missing list visible as pending", () => {
		const result = analyzePortfolio(
			book({
				holdings: [fundHolding("world", 800), fundHolding("gap", 200)],
				funds: [
					listed("world", [{ ...ALDER, weight: 1 }]),
					{ holdingId: "gap", holdings: { status: "missing" } },
				],
			}),
		);
		expect(result.funds.find((f) => f.holdingId === "gap")?.treatment).toBe(
			"pending",
		);
		expect(result.coverage.opaquePending).toBeCloseTo(0.2, 10);
		expect(result.status).toBe("partial");
		expect(result.reasonCodes).toContain("fund_holdings_missing");
	});

	it("reports an all-unvalued book as unavailable without NaN", () => {
		const result = analyzePortfolio(
			book({
				holdings: [
					fundHolding("world", null),
					{
						id: "alder",
						kind: "security",
						name: ALDER.name,
						isin: ALDER.isin,
						value: null,
						listingCurrency: "USD",
						assetClass: "equities",
					},
				],
			}),
		);
		expect(result.status).toBe("unavailable");
		expect(result.reasonCodes).toEqual(["no_valued_holdings"]);
		expect(JSON.stringify(result)).not.toContain("NaN");
		expect(JSON.stringify(result)).not.toContain("null,null");
		expect(result.valuation.unvalued.map((u) => u.id)).toEqual([
			"world",
			"alder",
		]);
	});

	it("treats one fund held at two accounts as one fund", () => {
		const shared = { isin: "IESYN0000990", ticker: "WRLD" };
		const result = analyzePortfolio(
			book({
				holdings: [
					fundHolding("world-a", 300, shared),
					fundHolding("world-b", 700, shared),
				],
				funds: [
					listed("world-a", [
						{ ...ALDER, weight: 0.5 },
						{ ...CEDAR, weight: 0.5 },
					]),
					listed("world-b", [
						{ ...ALDER, weight: 0.5 },
						{ ...CEDAR, weight: 0.5 },
					]),
				],
			}),
		);
		expect(result.overlap).toEqual([]);
		expect(result.funds).toHaveLength(1);
		expect(result.funds[0]?.holdingId).toBe("world-a");
		expect(result.basis.find((b) => b.key === "equities")?.weight).toBeCloseTo(
			1,
			10,
		);
		expect(
			result.positions.find((p) => p.isin === ALDER.isin)?.weight,
		).toBeCloseTo(0.5, 10);
	});

	it("merges a company held directly and through two funds into one position", () => {
		const result = analyzePortfolio(
			book({
				holdings: [
					{
						id: "alder",
						kind: "security",
						name: ALDER.name,
						isin: ALDER.isin,
						value: 100,
						listingCurrency: "USD",
						assetClass: "equities",
					},
					fundHolding("world", 500),
					fundHolding("tech", 400),
				],
				funds: [
					listed("world", [
						{ ...ALDER, weight: 0.2 },
						{ ...CEDAR, weight: 0.8 },
					]),
					listed("tech", [
						{ ...ALDER, weight: 0.5 },
						{ ...CEDAR, weight: 0.5 },
					]),
				],
			}),
		);
		const alder = result.positions.filter((p) => p.isin === ALDER.isin);
		expect(alder).toHaveLength(1);
		expect(alder[0]?.weight).toBeCloseTo(0.4, 10);
		expect(alder[0]?.direct).toBeCloseTo(0.1, 10);
		expect(alder[0]?.viaFunds.map((v) => v.holdingId).sort()).toEqual([
			"tech",
			"world",
		]);
		expect(result.overlap).toHaveLength(1);
		expect(result.overlap[0]?.overlap).toBeCloseTo(0.7, 10);
		expect(result.dimensions.sector.buckets[0]).toMatchObject({
			key: "technology",
		});
	});

	it("replays a saved snapshot to the same result", () => {
		const result = analyzePortfolio(
			book({
				holdings: [fundHolding("world", 1000)],
				funds: [
					listed("world", [
						{ ...ALDER, weight: 0.6 },
						{ ...CEDAR, weight: 0.4 },
					]),
				],
			}),
		);
		expect(result.methodologyVersion).toBe(METHODOLOGY_VERSION);
		expect(
			replayPortfolioAnalysis(JSON.parse(JSON.stringify(result.snapshot))),
		).toEqual(result);
	});

	it("refuses to replay a snapshot from another methodology", () => {
		expect(() =>
			replayPortfolioAnalysis({
				methodologyVersion: "other-v0",
				request: book(),
			}),
		).toThrow(PortfolioInputError);
	});

	it("does not change the caller's request", () => {
		const request = book({
			holdings: [fundHolding("world", 1000)],
			funds: [listed("world", [{ ...ALDER, weight: 1 }])],
		});
		const before = JSON.stringify(request);
		analyzePortfolio(request);
		expect(JSON.stringify(request)).toBe(before);
	});
});
