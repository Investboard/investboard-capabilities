import { describe, expect, it } from "vitest";
import {
	LIMITS,
	analyzePortfolio,
	measureCorrelations,
	replayPortfolioAnalysis,
	replayCorrelations,
	PortfolioInputError,
	validateCorrelationRequest,
	validatePortfolioRequest,
} from "../src/index.js";
import type { CorrelationRequest, PortfolioRequest } from "../src/index.js";

function book(): PortfolioRequest {
	return {
		asOf: "2026-10-30",
		baseCurrency: "EUR",
		holdings: [
			{
				id: "world",
				kind: "fund",
				name: "Synthetic World Fund",
				isin: "IE0000000011",
				value: 600,
				listingCurrency: "EUR",
				assetClass: "equities",
			},
			{
				id: "alpha",
				kind: "security",
				name: "Alpha Industries",
				isin: "US1111110001",
				value: 300,
				listingCurrency: "USD",
				assetClass: "equities",
			},
			{
				id: "cash",
				kind: "cash",
				name: "Cash",
				value: 100,
				listingCurrency: "EUR",
				assetClass: "cash",
			},
		],
		funds: [
			{
				holdingId: "world",
				holdings: {
					status: "listed",
					asOf: "2026-09-30",
					constituents: [
						{
							id: "alpha",
							isin: "US1111110001",
							name: "Alpha Industries",
							weight: 0.4,
						},
						{
							id: "beta",
							isin: "US2222220002",
							name: "Beta Systems",
							weight: 0.3,
						},
					],
				},
			},
		],
	};
}

function rejects(request: PortfolioRequest, message: RegExp) {
	expect(() => validatePortfolioRequest(request)).toThrow(PortfolioInputError);
	expect(() => validatePortfolioRequest(request)).toThrow(message);
}

describe("portfolio request validation", () => {
	it("accepts a well-formed book", () => {
		expect(() => validatePortfolioRequest(book())).not.toThrow();
	});

	it("rejects percent weights", () => {
		const request = book();
		const fund = request.funds![0]!;
		if (fund.holdings.status !== "listed") throw new Error("fixture");
		fund.holdings.constituents[0]!.weight = 40;
		rejects(request, /world.*fractions of 1/);
	});

	it("rejects a fund input for an unknown holding", () => {
		const request = book();
		request.funds![0]!.holdingId = "nowhere";
		rejects(request, /nowhere/);
	});

	it("rejects a fund input for a holding that is not a fund", () => {
		const request = book();
		request.funds![0]!.holdingId = "alpha";
		rejects(request, /alpha.*not a fund/);
	});

	it("rejects a lower-case or unknown base currency", () => {
		for (const baseCurrency of ["eur", "EURO", ""]) {
			rejects({ ...book(), baseCurrency }, /currenc/i);
		}
	});

	it("rejects duplicate holding ids", () => {
		const request = book();
		request.holdings[1]!.id = "world";
		rejects(request, /duplicate/i);
	});

	it("rejects a negative value", () => {
		const request = book();
		request.holdings[1]!.value = -1;
		rejects(request, /value/i);
	});

	it("rejects an invalid as-of date", () => {
		rejects({ ...book(), asOf: "2026-02-30" }, /date/i);
	});

	it("accepts an unvalued holding", () => {
		const request = book();
		request.holdings[1]!.value = null;
		expect(() => validatePortfolioRequest(request)).not.toThrow();
	});

	it("accepts a fund with no fund input", () => {
		const request = book();
		request.funds = [];
		expect(() => validatePortfolioRequest(request)).not.toThrow();
	});

	it("rejects more holdings than the limit", () => {
		const request = book();
		request.holdings = Array.from({ length: LIMITS.holdings + 1 }, (_, i) => ({
			id: `h${i}`,
			kind: "security" as const,
			name: `Holding ${i}`,
			value: 1,
			listingCurrency: "EUR",
			assetClass: "equities" as const,
		}));
		request.funds = [];
		rejects(request, /limit/i);
	});

	it("rejects an unknown asset class", () => {
		const request = book();
		(request.holdings[1] as { assetClass: string }).assetClass = "stocks";
		rejects(request, /asset class/i);
	});
});

describe("correlation request validation", () => {
	it("rejects a close for a holding that is not in the request", () => {
		expect(() =>
			validateCorrelationRequest({
				asOf: "2026-10-30",
				baseCurrency: "EUR",
				holdings: [{ id: "a", value: 1, priceCurrency: "EUR" }],
				closes: [{ id: "b", date: "2026-10-01", close: 1 }],
			}),
		).toThrow(PortfolioInputError);
	});

	it("rejects a non-positive close", () => {
		expect(() =>
			validateCorrelationRequest({
				asOf: "2026-10-30",
				baseCurrency: "EUR",
				holdings: [{ id: "a", value: 1, priceCurrency: "EUR" }],
				closes: [{ id: "a", date: "2026-10-01", close: 0 }],
			}),
		).toThrow(/close/i);
	});
});

describe("point-in-time evidence", () => {
	it("uses same-day lists and refuses later fund and index disclosures", () => {
		const input = book();
		const fund = input.funds![0]!;
		if (fund.holdings.status !== "listed")
			throw new Error("expected a fund list");
		fund.holdings.asOf = input.asOf;
		expect(analyzePortfolio(input).constituentsAsOf).toBe(input.asOf);

		fund.holdings.asOf = "2026-11-01";
		expect(() => analyzePortfolio(input)).toThrow(
			/world.*holdings.*after the analysis/,
		);
		const { constituents, asOf } = fund.holdings;
		fund.holdings = { status: "missing" };
		fund.readThrough = {
			index: "Synthetic Index",
			fundName: "Synthetic Index Fund",
			asOf,
			constituents,
		};
		expect(() => analyzePortfolio(input)).toThrow(
			/world.*readThrough.*after the analysis/,
		);
	});
});

function marketBook(): CorrelationRequest {
	const holdings = [
		{ id: "a", value: 100, priceCurrency: "USD" },
		{ id: "b", value: 100, priceCurrency: "EUR" },
		{ id: "c", value: 100, priceCurrency: "EUR" },
	];
	const dates = Array.from({ length: 53 }, (_, i) =>
		new Date(Date.UTC(2023, 0, 6 + 7 * i)).toISOString().slice(0, 10),
	);
	return {
		asOf: "2024-01-06",
		baseCurrency: "EUR",
		holdings,
		closes: dates.flatMap((date, i) =>
			holdings.map(({ id }, j) => ({ id, date, close: 100 + (i % (j + 2)) })),
		),
		fx: dates.map((date) => ({ date, currency: "USD", rateToBase: 0.9 })),
	};
}

describe("JSON results and replay", () => {
	it("rejects unsupported or non-JSON metadata, and never evaluates accessors", () => {
		const portfolio = { ...book(), metadata: { note: "external context" } };
		expect(() => analyzePortfolio(portfolio)).toThrow(
			/unsupported field metadata/,
		);
		expect(() => analyzePortfolio({ ...book(), metadata: 5n })).toThrow(
			PortfolioInputError,
		);

		const cyclic = { ...marketBook(), metadata: {} };
		cyclic.metadata = cyclic;
		expect(() => measureCorrelations(cyclic)).toThrow(/cycle/);
		let getterCalls = 0;
		const correlation = Object.defineProperty(marketBook(), "holdings", {
			enumerable: true,
			get() {
				getterCalls++;
				return [];
			},
		});
		expect(() => measureCorrelations(correlation)).toThrow(/data properties/);
		expect(getterCalls).toBe(0);
	});

	it("replays canonical snapshots with optional undefined fields omitted", () => {
		const input = book();
		input.holdings[0]!.ticker = undefined;
		const result = analyzePortfolio(input);
		expect(result.snapshot.request.holdings[0]).not.toHaveProperty("ticker");
		expect(
			replayPortfolioAnalysis(JSON.parse(JSON.stringify(result.snapshot))),
		).toStrictEqual(result);

		const correlation = measureCorrelations(marketBook());
		const window = correlation.windows[0]!;
		expect(window.status).toBe("available");
		if (window.status !== "available")
			throw new Error("expected one-year correlations");
		expect(window.pairs).toHaveLength(3);
		expect(
			window.pairs.every((pair) => Number.isFinite(pair.correlation)),
		).toBe(true);
		expect(
			replayCorrelations(JSON.parse(JSON.stringify(correlation.snapshot))),
		).toStrictEqual(correlation);
	});

	it("rejects extreme finite closes and rates before they can overflow", () => {
		const input = marketBook();
		input.closes[0]!.close = 1e308;
		expect(() => measureCorrelations(input)).toThrow(/close.*market range/i);
		input.closes[0]!.close = LIMITS.maxMarketValue;
		input.fx![0]!.rateToBase = Number.MIN_VALUE;
		expect(() => measureCorrelations(input)).toThrow(/FX rate.*market range/i);
	});
});
