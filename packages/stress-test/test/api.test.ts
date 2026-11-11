import { describe, expect, it } from "vitest";
import {
	BUILT_IN_SCENARIOS,
	evaluateStressScenario,
	METHODOLOGY_VERSION,
	MAX_SUPPORTED_WEALTH,
	replayStressScenario,
	StressInputError,
} from "../src/index.js";
import type { HistoricalWindow, StressRequest } from "../src/index.js";

const scenario = BUILT_IN_SCENARIOS.find((s) => s.key === "gfc_2008");
if (!scenario) throw new Error("Missing GFC scenario");
const share = {
	holdingId: "one",
	isin: "XX0000000001",
	ticker: "SYNTHETIC",
	name: "Synthetic fund",
	sector: "Other",
	assetClass: "equities",
	instrumentType: "fund_etf",
	currency: "USD",
	currentValue: 100,
};
function request(): StressRequest {
	return {
		holdings: [{ ...share }],
		scenario: structuredClone(scenario),
		baseCurrency: "EUR",
	};
}
function history(): HistoricalWindow {
	return {
		ticker: share.ticker,
		isin: share.isin,
		currency: "USD",
		basis: "total",
		start: { date: scenario.dateFrom, value: 100 },
		end: { date: scenario.dateTo, value: 80 },
		source: "Synthetic price and FX fixture",
		fx: {
			baseCurrency: "EUR",
			from: { effectiveDate: scenario.dateFrom, rate: 0.9 },
			to: { effectiveDate: scenario.dateTo, rate: 0.81 },
		},
	};
}

describe("public scenario boundary", () => {
	it("preserves quote invariance and explicit unknown currency decomposition", () => {
		const input = request();
		input.holdings = ["EUR", "USD"].map((currency) => ({
			...share,
			holdingId: currency,
			currency,
		}));
		const result = evaluateStressScenario(input);
		expect(result.status).toBe("partial");
		expect(
			result.calculation?.holdingImpacts.map((h) => h.postStressValue),
		).toEqual([43, 43]);
		expect(
			result.calculation?.holdingImpacts.map((h) => h.fxShockApplied),
		).toEqual([null, null]);
		expect(
			result.calculation?.coverage.currencyDecompositionValueFraction,
		).toBe(0);
	});
	it("does not identify a cash-like legacy security from absent metadata", () => {
		const input = request();
		input.holdings = ["EUR", "USD"].map((currency) => ({
			...share,
			holdingId: currency,
			isin: null,
			instrumentType: null,
			assetClass: "cash",
			currency,
		}));
		const result = evaluateStressScenario(input);
		expect(result.status).toBe("partial");
		expect(
			result.calculation?.holdingImpacts.map((h) => h.postStressValue),
		).toEqual([100, 100]);
	});
	it.each([
		"cash",
		"manual-other",
	])("supports affirmative %s cash identity", (kind) => {
		const input = request();
		input.holdings = [
			{
				...share,
				isin: null,
				assetClass: "cash",
				instrumentType: kind === "cash" ? "cash" : "other",
				priceSource: "manual",
			},
		];
		const result = evaluateStressScenario(input);
		expect(result.status).toBe("available");
		// gfc_2008, EUR base: USD moved +0.12 against the euro, so EUR 100 of USD cash ends at EUR 112.
		expect(result.calculation?.postStressTotal).toBe(112);
		expect(
			result.calculation?.coverage.currencyDecompositionValueFraction,
		).toBe(1);
	});
	it.each([
		"unhedged",
		"hedged",
	] as const)("records a verified %s economic currency rather than the quote currency", (hedge) => {
		const input = request();
		input.holdings[0] = {
			...share,
			currency: "EUR",
			economicCurrency: {
				currency: hedge === "hedged" ? "EUR" : "USD",
				hedge,
				source: "Synthetic verified exposure",
			},
		};
		const result = evaluateStressScenario(input);
		expect(result.status).toBe("available");
		expect(result.calculation?.postStressTotal).toBe(
			hedge === "hedged" ? 43 : 48.16,
		);
	});
	it.each([
		"unsupported_class",
		"unsupported_fx",
	])("refuses %s rather than reporting zero loss", (kind) => {
		const input = request();
		input.holdings[0] =
			kind === "unsupported_class"
				? { ...share, assetClass: "unknown" }
				: {
						...share,
						isin: null,
						assetClass: "cash",
						instrumentType: "cash",
						currency: "ZZZ",
					};
		expect(evaluateStressScenario(input)).toMatchObject({
			status: "unavailable",
			calculation: null,
			reasonCodes: ["unsupported_scenario_exposure"],
		});
	});
	it("reconciles cent-rounded loss drivers, offsets and total wealth", () => {
		const input = request();
		input.holdings = [
			{ ...share, currentValue: 100.01 },
			{
				...share,
				holdingId: "two",
				isin: "XX0000000002",
				currentValue: 199.99,
			},
		];
		const result = evaluateStressScenario(input);
		const a = result.calculation?.attribution;
		expect(result.calculation?.preStressTotal).toBe(300);
		expect(result.calculation?.postStressTotal).toBe(129);
		expect(a?.netImpactCents).toBe(-17100);
		expect(
			a &&
				a.lossDrivers.reduce(
					(sum, row) => sum + row.impactCents,
					a.otherImpactCents,
				),
		).toBe(a?.netImpactCents);
	});
});

describe("caller-supplied direct history", () => {
	it("reproduces 72 EUR from observed USD endpoints and dated FX ratios", () => {
		const input = request();
		input.histories = [history()];
		const result = evaluateStressScenario(input);
		expect(result.status).toBe("available");
		expect(result.calculation?.postStressTotal).toBe(72);
		expect(result.calculation?.holdingImpacts[0]).toMatchObject({
			shockSource: "historical_price",
			currencyMethod: "direct_history",
			historicalBasis: "total",
			actualDateFrom: scenario.dateFrom,
			actualDateTo: scenario.dateTo,
		});
		expect(result.calculation?.coverage).toEqual({
			directValueFraction: 1,
			proxyValueFraction: 0,
			currencyDecompositionValueFraction: 1,
		});
	});
	it.each([
		"identity",
		"currency",
		"missing_fx",
		"future_fixing",
		"stale_fixing",
		"far_endpoint",
		"basis",
		"missing_source",
		"zero_price",
		"invalid_date",
	])("discloses rejected %s evidence and uses the named partial proxy", (kind) => {
		const h = history();
		if (kind === "identity") h.isin = "XX0000000002";
		if (kind === "currency") h.currency = "EUR";
		if (kind === "missing_fx") delete h.fx;
		if (kind === "future_fixing" && h.fx)
			h.fx.from.effectiveDate = "2007-10-10";
		if (kind === "stale_fixing" && h.fx) h.fx.from.effectiveDate = "2007-10-01";
		if (kind === "far_endpoint") h.start.date = "2007-10-03";
		if (kind === "basis") Object.assign(h, { basis: "unknown" });
		if (kind === "missing_source") h.source = "";
		if (kind === "zero_price") h.start.value = 0;
		if (kind === "invalid_date") h.end.date = "2009-02-30";
		const input = request();
		input.histories = [h];
		const result = evaluateStressScenario(input);
		expect(result.status).toBe("partial");
		expect(result.calculation?.postStressTotal).toBe(43);
		expect(result.calculation?.coverage.directValueFraction).toBe(0);
		expect(result.reasonCodes.length).toBeGreaterThan(1);
	});
	it("admits a five-day endpoint fallback with a seven-day preceding fixing", () => {
		const h = history();
		h.start.date = "2007-10-04";
		if (!h.fx) throw new Error("Missing fixture FX");
		h.fx.from.effectiveDate = "2007-09-27";
		const input = request();
		input.histories = [h];
		expect(evaluateStressScenario(input).calculation?.postStressTotal).toBe(72);
	});
	it("names dividend omission instead of calling price return total return", () => {
		const input = request();
		const h = history();
		h.basis = "price";
		input.histories = [h];
		expect(evaluateStressScenario(input)).toMatchObject({
			status: "available",
			reasonCodes: ["price_return_without_dividends"],
		});
	});
	it("does not choose arbitrarily between conflicting direct histories", () => {
		const input = request();
		input.histories = [
			history(),
			{ ...history(), end: { date: scenario.dateTo, value: 70 } },
		];
		expect(evaluateStressScenario(input)).toMatchObject({
			status: "partial",
			reasonCodes: expect.arrayContaining(["history_ambiguous"]),
		});
	});
});

describe("validation and immutable replay", () => {
	it.each([
		"empty",
		"duplicate",
		"negative",
		"nan",
		"infinity",
		"unsafe",
		"subcent",
		"reporting_currency",
		"economic_source",
		"hedge",
		"scenario_date",
		"missing_provenance",
		"invalid_isin",
		"null_history",
		"unknown_field",
		"non_json",
		"scenario_summary",
		"malformed_exposure",
		"currency_review_date",
	])("rejects %s inputs at the public boundary", (kind) => {
		const input = request();
		if (kind === "unknown_field")
			Object.assign(input, { accountEmail: "private@example.test" });
		if (kind === "non_json")
			Object.assign(input.scenario.name, { en: () => "not data" });
		if (kind === "scenario_summary")
			Object.assign(input.scenario, { peakToTroughPct: Number.NaN });
		if (kind === "malformed_exposure")
			Object.assign(input.holdings[0] ?? {}, { economicCurrency: [] });
		if (kind === "empty") input.holdings = [];
		if (kind === "duplicate") input.holdings.push({ ...share });
		if (kind === "negative") input.holdings[0] = { ...share, currentValue: -1 };
		if (kind === "nan")
			input.holdings[0] = { ...share, currentValue: Number.NaN };
		if (kind === "infinity")
			input.holdings[0] = { ...share, currentValue: Number.POSITIVE_INFINITY };
		if (kind === "unsafe")
			input.holdings[0] = { ...share, currentValue: Number.MAX_VALUE };
		if (kind === "subcent")
			input.holdings[0] = { ...share, currentValue: 0.105 };
		if (kind === "reporting_currency")
			Object.assign(input, { baseCurrency: "SEK" });
		if (kind === "economic_source")
			input.holdings[0] = {
				...share,
				economicCurrency: { currency: "USD", hedge: "unhedged", source: "" },
			};
		if (kind === "hedge")
			Object.assign(input.holdings[0] ?? {}, {
				economicCurrency: { currency: "USD", hedge: "partial", source: "Test" },
			});
		if (kind === "scenario_date") input.scenario.dateTo = "2009-02-30";
		if (kind === "missing_provenance")
			Object.assign(input.scenario, { provenance: undefined });
		if (kind === "currency_review_date" && input.scenario.provenance)
			Object.assign(input.scenario.provenance, {
				currencyReviewedAt: "2026-13-01",
			});
		if (kind === "invalid_isin") input.holdings[0] = { ...share, isin: "" };
		if (kind === "null_history") Object.assign(input, { histories: [null] });
		expect(() => evaluateStressScenario(input)).toThrow(StressInputError);
	});
	it.each([
		"date",
		"boxed",
		"accessor",
		"hidden",
		"sparse",
	])("rejects %s history metadata that could change meaning after JSON storage", (kind) => {
		const input = request();
		const h = history();
		if (kind === "date") Object.assign(h, { source: new Date("2020-01-01") });
		if (kind === "boxed")
			Object.assign(h, { source: Object("Synthetic source") });
		if (kind === "accessor")
			Object.defineProperty(h, "source", {
				enumerable: true,
				get: () => "Synthetic source",
			});
		if (kind === "hidden")
			Object.defineProperty(h, "source", {
				value: "Synthetic source",
				enumerable: false,
			});
		if (kind === "sparse" && input.scenario.provenance)
			Object.assign(input.scenario.provenance, { sources: Array(1) });
		input.histories = [h];
		expect(() => evaluateStressScenario(input)).toThrow(StressInputError);
	});
	it.each([
		[70368744177664.02, 0.02],
		[90071992547409.9],
	])("refuses wealth outside the supported cent-safe range: %j", (...values) => {
		const input = request();
		input.holdings = values.map((currentValue, index) => ({
			...share,
			holdingId: String(index),
			currentValue,
		}));
		expect(() => evaluateStressScenario(input)).toThrow(StressInputError);
	});
	it("reconciles 200 cent-valued holdings at the documented wealth limit", () => {
		const input = request();
		input.holdings = Array.from({ length: 200 }, (_, index) => ({
			...share,
			holdingId: String(index),
			isin: null,
			assetClass: "cash",
			instrumentType: "cash",
			currency: "EUR",
			currentValue: index === 199 ? 4_999_998.01 : 5_000_000.01,
		}));
		const result = evaluateStressScenario(input);
		expect(result.calculation?.attribution.preStressValueCents).toBe(
			MAX_SUPPORTED_WEALTH * 100,
		);
		expect(result.calculation?.postStressTotal).toBe(MAX_SUPPORTED_WEALTH);
		expect(result.calculation?.absoluteLoss).toBe(0);
		expect(
			replayStressScenario(JSON.parse(JSON.stringify(result.snapshot))),
		).toEqual(result);
	});
	it("refuses a gain that takes calculated wealth above the limit", () => {
		const input = request();
		input.holdings = [
			{
				...share,
				isin: null,
				assetClass: "gold",
				currentValue: MAX_SUPPORTED_WEALTH,
			},
		];
		expect(() => evaluateStressScenario(input)).toThrow(StressInputError);
	});
	it("protects built-in assumptions against mutation", () => {
		expect(Object.isFrozen(scenario)).toBe(true);
		expect(Object.isFrozen(scenario.assetClassShocks)).toBe(true);
		expect(() => {
			scenario.assetClassShocks.equities = 0;
		}).toThrow(TypeError);
	});
	it("retains the original inputs and reproduces a JSON-round-tripped direct calculation", () => {
		const input = request();
		input.histories = [history()];
		const result = evaluateStressScenario(input);
		input.holdings[0] = { ...share, currentValue: 999 };
		input.scenario.assetClassShocks.equities = 0;
		if (input.histories[0]) input.histories[0].end.value = 1;
		expect(result.snapshot.request.holdings[0]?.currentValue).toBe(100);
		expect(
			replayStressScenario(JSON.parse(JSON.stringify(result.snapshot))),
		).toEqual(result);
	});
	it("replays a saved snapshot with the scenario figures it was saved with", () => {
		// A 0.1.0 snapshot carries the earlier hand-entered gfc_2008 USD move
		// (-0.08) and no currency review date. Replay must keep its result.
		const input = request();
		input.holdings = [
			{
				...share,
				isin: null,
				assetClass: "cash",
				instrumentType: "cash",
				priceSource: "manual",
			},
		];
		input.scenario.currencyShocks.USD = -0.08;
		if (input.scenario.provenance) {
			const { currencyReviewedAt: _, ...earlier } = input.scenario.provenance;
			input.scenario.provenance = earlier;
		}
		const saved = JSON.parse(
			JSON.stringify(evaluateStressScenario(input).snapshot),
		);
		const replayed = replayStressScenario(saved);
		expect(replayed.calculation?.postStressTotal).toBe(92);
		expect(replayed.snapshot.request.scenario.currencyShocks.USD).toBe(-0.08);
		expect(
			evaluateStressScenario(request()).snapshot.request.scenario.currencyShocks
				.USD,
		).toBe(0.12);
	});
	it("refuses an unsupported historical methodology instead of silently recomputing it", () => {
		const result = evaluateStressScenario(request());
		expect(result.snapshot.methodologyVersion).toBe(METHODOLOGY_VERSION);
		expect(() =>
			replayStressScenario({
				...result.snapshot,
				methodologyVersion: "older",
			} as never),
		).toThrow("Unsupported snapshot methodology");
	});
});
