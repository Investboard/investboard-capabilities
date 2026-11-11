import { describe, expect, it } from "vitest";
import {
	BUILT_IN_SCENARIOS,
	evaluateStressScenario,
	METHODOLOGY_VERSION,
	replayStressScenario,
	StressInputError,
} from "../src/index.js";
import type {
	CrisisDefinition,
	StressHoldingInput,
	StressRequest,
	StressResult,
	StressSnapshot,
} from "../src/index.js";
import savedV5 from "./methodology-v5-replays.json" with { type: "json" };

const scenario = (key: string): CrisisDefinition => {
	const found = BUILT_IN_SCENARIOS.find((s) => s.key === key);
	if (!found) throw new Error(`Missing scenario ${key}`);
	return structuredClone(found);
};
const fund: StressHoldingInput = {
	holdingId: "fund",
	isin: "XX0000000001",
	ticker: "FUND",
	name: "Synthetic share fund",
	sector: "Technology",
	assetClass: "equities",
	instrumentType: "fund_etf",
	currency: "EUR",
	currentValue: 900,
};
const cash = (currency: string, currentValue = 1000): StressHoldingInput => ({
	holdingId: `${currency.toLowerCase()}-cash`,
	isin: null,
	ticker: `${currency}-CASH`,
	name: `Synthetic ${currency} account`,
	sector: null,
	assetClass: "cash",
	instrumentType: "cash",
	currency,
	currentValue,
});
const coin: StressHoldingInput = {
	holdingId: "coin",
	isin: null,
	ticker: "COIN",
	name: "Synthetic crypto asset",
	sector: null,
	assetClass: "crypto",
	instrumentType: "other",
	currency: "EUR",
	currentValue: 10_000,
};
const collectible: StressHoldingInput = {
	...fund,
	holdingId: "art",
	isin: null,
	ticker: "ART",
	name: "Synthetic collectible",
	sector: null,
	assetClass: "collectibles",
	instrumentType: "other",
	currentValue: 100,
};
const bonds: StressHoldingInput = {
	...fund,
	holdingId: "bonds",
	isin: "XX0000000002",
	ticker: "BOND",
	name: "Synthetic bond fund",
	sector: null,
	assetClass: "bonds",
	currentValue: 1000,
};
const evaluate = (
	holdings: StressHoldingInput[],
	crisis: CrisisDefinition,
	baseCurrency: StressRequest["baseCurrency"] = "EUR",
) => evaluateStressScenario({ holdings, scenario: crisis, baseCurrency });
const postValues = (result: StressResult) =>
	Object.fromEntries(
		(result.calculation?.holdingImpacts ?? []).map((h) => [
			h.holdingId,
			h.postStressValue,
		]),
	);

const NO_CRYPTO_FIGURE = [
	"gfc_2008",
	"dotcom_2000",
	"black_monday_1987",
	"gulf_war_1990",
	"bond_massacre_1994",
	"asian_crisis_1997",
	"russia_ltcm_1998",
	"september_2001",
	"euro_crisis_2011",
];
const OWN_CRYPTO_FIGURE = [
	"covid_2020",
	"rate_hike_2022",
	"china_shock_2015",
	"q4_2018",
	"banking_stress_2023",
	"yen_carry_2024",
];

describe("crypto takes the shares figure where a scenario names none", () => {
	it.each(
		NO_CRYPTO_FIGURE,
	)("%s names no crypto figure and says crypto takes the shares figure", (key) => {
		const crisis = scenario(key);
		expect(Object.hasOwn(crisis.assetClassShocks, "crypto")).toBe(false);
		expect(crisis.provenance?.methodology).toMatch(
			/crypto has no figure of its own/i,
		);
		const impact = evaluate([coin], crisis).calculation?.holdingImpacts[0];
		expect(impact?.shockSource).toBe("asset_class_default");
		expect(impact?.shockApplied).toBe(crisis.assetClassShocks.equities);
	});

	it.each(OWN_CRYPTO_FIGURE)("%s keeps its own crypto figure", (key) => {
		const crisis = scenario(key);
		expect(Object.hasOwn(crisis.assetClassShocks, "crypto")).toBe(true);
		expect(
			evaluate([coin], crisis).calculation?.holdingImpacts[0]?.shockApplied,
		).toBe(crisis.assetClassShocks.crypto);
	});

	it("gfc_2008: EUR 10,000 of crypto ends at EUR 4,300 as a scenario assumption", () => {
		const result = evaluate([coin], scenario("gfc_2008"));
		expect(result.status).toBe("partial");
		expect(result.reasonCodes).toEqual([
			"proxy_currency_decomposition_unavailable",
		]);
		expect(result.calculation?.holdingImpacts[0]).toMatchObject({
			postStressValue: 4300,
			absoluteLoss: -5700,
			shockSource: "asset_class_default",
		});
		expect(result.calculation?.coverage.directValueFraction).toBe(0);
	});

	it("reads a crypto figure the scenario names before the stand-in", () => {
		const custom = scenario("gfc_2008");
		custom.key = "custom_crypto_zero";
		custom.assetClassShocks.crypto = 0;
		expect(postValues(evaluate([coin], custom))).toEqual({ coin: 10_000 });
	});
});

describe("result for the rest", () => {
	it("models what the scenario covers and lists each holding left out", () => {
		const nok = cash("NOK", 50);
		const result = evaluate([fund, collectible, nok], scenario("gfc_2008"));
		expect(result.status).toBe("partial");
		expect(result.reasonCodes).toContain("unmodeled_holdings_excluded");
		expect(result.calculation).toMatchObject({
			preStressTotal: 900,
			postStressTotal: 450,
			absoluteLoss: -450,
			percentageLoss: -0.5,
			excludedHoldings: [
				{
					holdingId: "art",
					ticker: "ART",
					name: "Synthetic collectible",
					value: 100,
					reason: "asset_class_not_modeled",
				},
				{
					holdingId: "nok-cash",
					ticker: "NOK-CASH",
					name: "Synthetic NOK account",
					value: 50,
					reason: "currency_not_modeled",
				},
			],
		});
		expect(result.calculation?.holdingImpacts.map((h) => h.holdingId)).toEqual([
			"fund",
		]);
		expect(result.calculation?.attribution).toMatchObject({
			preStressValueCents: 90_000,
			postStressValueCents: 45_000,
			netImpactCents: -45_000,
		});
		expect(result.calculation?.coverage).toEqual({
			directValueFraction: 0,
			proxyValueFraction: 1,
			currencyDecompositionValueFraction: 0,
		});
		expect(
			replayStressScenario(JSON.parse(JSON.stringify(result.snapshot))),
		).toEqual(result);
	});

	it("keeps the previous result shape when nothing is left out", () => {
		const result = evaluate([cash("USD", 100)], scenario("gfc_2008"));
		expect(result.status).toBe("available");
		expect(result.calculation).not.toHaveProperty("excludedHoldings");
		expect(result.reasonCodes).toEqual([]);
	});

	it("refuses only when nothing can be modeled", () => {
		expect(
			evaluate([collectible, cash("NOK", 50)], scenario("gfc_2008")),
		).toMatchObject({
			status: "unavailable",
			reasonCodes: ["unsupported_scenario_exposure"],
			calculation: null,
		});
	});

	it("pins new evaluations to the current methodology", () => {
		expect(METHODOLOGY_VERSION).toBe("whole-wealth-currency-replay-v6");
		expect(
			evaluate([fund], scenario("gfc_2008")).snapshot.methodologyVersion,
		).toBe(METHODOLOGY_VERSION);
	});
});

describe("saved whole-wealth-currency-replay-v5 snapshots", () => {
	const saved = savedV5 as unknown as Record<string, StressResult>;

	it.each(
		Object.keys(saved),
	)("replays %s to the result it was saved with", (name) => {
		const original = saved[name]!;
		expect(original.snapshot.methodologyVersion).toBe(
			"whole-wealth-currency-replay-v5",
		);
		expect(replayStressScenario(structuredClone(original.snapshot))).toEqual(
			original,
		);
	});

	it("evaluates the saved inputs again under the current methodology on request", () => {
		const original = saved.unmodeled_holdings!;
		expect(original.status).toBe("unavailable");
		const current = evaluateStressScenario(original.snapshot.request);
		expect(current.status).toBe("partial");
		expect(current.calculation?.excludedHoldings).toHaveLength(2);
	});

	it("refuses a v5 snapshot that names a reporting currency v5 did not support", () => {
		const original = saved.usd_reporting!;
		const snapshot = structuredClone(original.snapshot) as StressSnapshot;
		Object.assign(snapshot.request, { baseCurrency: "GBP" });
		expect(() => replayStressScenario(snapshot)).toThrow(StressInputError);
	});
});

describe("reporting currencies the scenario carries a move for", () => {
	it("reports a GBP base by the euro cross rate", () => {
		const result = evaluate(
			[cash("GBP"), cash("EUR"), cash("USD"), bonds],
			scenario("gfc_2008"),
			"GBP",
		);
		// GBP moved -0.24 against the euro and USD +0.12: one euro buys 1 / 0.76
		// as many pounds, one dollar 1.12 / 0.76 as many.
		expect(postValues(result)).toEqual({
			"gbp-cash": 1000,
			"eur-cash": 1315.79,
			"usd-cash": 1473.68,
			bonds: 950,
		});
		expect(result.calculation?.holdingImpacts[1]?.fxShockApplied).toBe(0.3158);
		expect(result.calculation?.holdingImpacts[3]).toMatchObject({
			fxShockApplied: null,
			currencyMethod: "unknown",
		});
		expect(result.calculation?.postStressTotal).toBe(4739.47);
		expect(result.baseCurrency).toBe("GBP");
	});

	it("reports a CHF base by the euro cross rate", () => {
		const result = evaluate(
			[cash("CHF"), cash("EUR"), cash("USD"), cash("GBP"), bonds],
			scenario("gfc_2008"),
			"CHF",
		);
		// CHF moved +0.14 against the euro: 1 / 1.14, 1.12 / 1.14, 0.76 / 1.14.
		expect(postValues(result)).toEqual({
			"chf-cash": 1000,
			"eur-cash": 877.19,
			"usd-cash": 982.46,
			"gbp-cash": 666.67,
			bonds: 950,
		});
		expect(result.calculation?.postStressTotal).toBe(4476.32);
		expect(result.calculation?.absoluteLoss).toBe(-523.68);
	});

	it("reports a JPY base by the euro cross rate", () => {
		// JPY moved +0.32 against the euro: one euro buys 1 / 1.32 as many yen.
		expect(
			postValues(evaluate([cash("EUR")], scenario("gfc_2008"), "JPY")),
		).toEqual({ "eur-cash": 757.58 });
	});

	it("converts direct history with dated fixings in a GBP base", () => {
		const crisis = scenario("gfc_2008");
		const result = evaluateStressScenario({
			holdings: [{ ...fund, currency: "USD", currentValue: 100 }],
			scenario: crisis,
			baseCurrency: "GBP",
			histories: [
				{
					ticker: "FUND",
					isin: "XX0000000001",
					currency: "USD",
					basis: "total",
					start: { date: crisis.dateFrom, value: 100 },
					end: { date: crisis.dateTo, value: 80 },
					source: "Synthetic price and FX fixture",
					fx: {
						baseCurrency: "GBP",
						from: { effectiveDate: crisis.dateFrom, rate: 0.5 },
						to: { effectiveDate: crisis.dateTo, rate: 0.6 },
					},
				},
			],
		});
		expect(result.status).toBe("available");
		expect(result.calculation?.postStressTotal).toBe(96);
	});

	it("supports every reporting currency in every built-in scenario", () => {
		for (const crisis of BUILT_IN_SCENARIOS)
			for (const base of ["EUR", "USD", "GBP", "CHF", "JPY"] as const)
				expect([
					crisis.key,
					base,
					evaluate([cash(base)], crisis, base).status,
				]).toEqual([crisis.key, base, "available"]);
	});

	it("refuses a scenario that carries no move for the reporting currency", () => {
		const crisis = scenario("gfc_2008");
		crisis.key = "custom_without_franc";
		crisis.currencyShocks = { EUR: 0, USD: 0.12 };
		expect(evaluate([bonds], crisis, "CHF")).toMatchObject({
			status: "unavailable",
			reasonCodes: ["unsupported_base_currency"],
			calculation: null,
		});
	});

	it("rejects a reporting currency outside the supported list", () => {
		expect(() =>
			evaluate([cash("EUR")], scenario("gfc_2008"), "SEK" as never),
		).toThrow(StressInputError);
	});
});
