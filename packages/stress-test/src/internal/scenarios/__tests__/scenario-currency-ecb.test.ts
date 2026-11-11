import { describe, expect, it } from "vitest";
import { BUILT_IN_SCENARIOS } from "../crisis-definitions.js";

/**
 * The USD, GBP, CHF and JPY moves of the ten scenarios since 1999 are each
 * currency's move against the euro over the scenario window, computed from
 * the ECB euro foreign exchange reference rates (units of the currency per
 * 1 EUR) on the window's first and last day:
 *
 *   move = rateStart / rateEnd - 1, rounded to two decimals.
 *
 * The rates are embedded here so a figure cannot drift from its source.
 * Source: https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html
 * The five scenarios before 1999 have no euro reference rate and are not
 * covered here.
 */
type Rates = { USD: number; GBP: number; CHF: number; JPY: number };
const ECB_URL =
	"https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";
const ECB: Record<
	string,
	{ from: string; to: string; start: Rates; end: Rates }
> = {
	gfc_2008: {
		from: "2007-10-09",
		to: "2009-03-09",
		start: { USD: 1.4037, GBP: 0.69185, CHF: 1.6669, JPY: 164.54 },
		end: { USD: 1.2565, GBP: 0.9114, CHF: 1.4669, JPY: 124.4 },
	},
	covid_2020: {
		from: "2020-02-19",
		to: "2020-03-23",
		start: { USD: 1.08, GBP: 0.83148, CHF: 1.0621, JPY: 119.35 },
		end: { USD: 1.0783, GBP: 0.9297, CHF: 1.059, JPY: 119.11 },
	},
	rate_hike_2022: {
		from: "2022-01-03",
		to: "2022-10-12",
		start: { USD: 1.1355, GBP: 0.84135, CHF: 1.0372, JPY: 130.56 },
		end: { USD: 0.9706, GBP: 0.8784, CHF: 0.9664, JPY: 142.34 },
	},
	euro_crisis_2011: {
		from: "2011-05-02",
		to: "2011-10-04",
		start: { USD: 1.4837, GBP: 0.8892, CHF: 1.2856, JPY: 120.85 },
		end: { USD: 1.3181, GBP: 0.8565, CHF: 1.2169, JPY: 101.08 },
	},
	dotcom_2000: {
		from: "2000-03-10",
		to: "2002-10-09",
		start: { USD: 0.9613, GBP: 0.6095, CHF: 1.6078, JPY: 102.27 },
		end: { USD: 0.9814, GBP: 0.6318, CHF: 1.4666, JPY: 121.89 },
	},
	china_shock_2015: {
		from: "2015-08-10",
		to: "2016-02-11",
		start: { USD: 1.096, GBP: 0.7071, CHF: 1.08, JPY: 136.67 },
		end: { USD: 1.1347, GBP: 0.7874, CHF: 1.1027, JPY: 127.3 },
	},
	q4_2018: {
		from: "2018-09-20",
		to: "2018-12-24",
		start: { USD: 1.1769, GBP: 0.8859, CHF: 1.1312, JPY: 131.98 },
		end: { USD: 1.1408, GBP: 0.90038, CHF: 1.1312, JPY: 126.47 },
	},
	banking_stress_2023: {
		from: "2023-03-06",
		to: "2023-05-04",
		start: { USD: 1.0646, GBP: 0.8863, CHF: 0.9947, JPY: 144.64 },
		end: { USD: 1.1074, GBP: 0.88015, CHF: 0.9802, JPY: 148.92 },
	},
	yen_carry_2024: {
		from: "2024-07-16",
		to: "2024-08-05",
		start: { USD: 1.0902, GBP: 0.84058, CHF: 0.9761, JPY: 172.65 },
		end: { USD: 1.0966, GBP: 0.85878, CHF: 0.9304, JPY: 155.98 },
	},
	september_2001: {
		from: "2001-09-10",
		to: "2001-09-21",
		start: { USD: 0.9047, GBP: 0.6172, CHF: 1.5145, JPY: 109.05 },
		end: { USD: 0.92, GBP: 0.6301, CHF: 1.4464, JPY: 107.18 },
	},
};
const CURRENCIES = ["USD", "GBP", "CHF", "JPY"] as const;
const PRE_EURO = [
	"black_monday_1987",
	"gulf_war_1990",
	"bond_massacre_1994",
	"asian_crisis_1997",
	"russia_ltcm_1998",
];

/** Two-decimal move against EUR; `|| 0` keeps a rounded -0 as 0. */
const move = (start: number, end: number) =>
	Math.round((start / end - 1) * 100) / 100 || 0;

function scenario(key: string) {
	const crisis = BUILT_IN_SCENARIOS.find((s) => s.key === key);
	if (!crisis) throw new Error(`Missing scenario ${key}`);
	return crisis;
}

describe("scenario currency moves come from ECB reference rates", () => {
	it("covers exactly the built-in scenarios since 1999", () => {
		const keys = BUILT_IN_SCENARIOS.map((s) => s.key);
		expect([...Object.keys(ECB), ...PRE_EURO].sort()).toEqual([...keys].sort());
	});

	it.each(
		Object.entries(ECB),
	)("%s: USD, GBP, CHF and JPY equal the ECB rates on the window's first and last day", (key, rates) => {
		const crisis = scenario(key);
		expect({ from: crisis.dateFrom, to: crisis.dateTo }).toEqual({
			from: rates.from,
			to: rates.to,
		});
		for (const currency of CURRENCIES)
			expect(crisis.currencyShocks[currency], `${key} ${currency}`).toBe(
				move(rates.start[currency], rates.end[currency]),
			);
		expect(crisis.provenance?.currencyReviewedAt).toBe("2026-11-11");
		expect(crisis.provenance?.sources.join(" ")).toContain(ECB_URL);
		expect(crisis.provenance?.methodology).toMatch(/ECB/);
		expect(crisis.provenance?.approximate).toBe(true);
	});

	it.each(
		PRE_EURO,
	)("%s predates the euro and claims no currency review", (key) => {
		expect(scenario(key).provenance?.currencyReviewedAt).toBeUndefined();
	});
});
