import { describe, expect, it } from "vitest";
import {
	LIMITS,
	PortfolioInputError,
	validateCorrelationRequest,
	validatePortfolioRequest,
} from "../src/index.js";
import type { PortfolioRequest } from "../src/index.js";

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
