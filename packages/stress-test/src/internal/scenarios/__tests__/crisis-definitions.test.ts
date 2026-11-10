const assetClassEnum = {
	options: [
		"equities",
		"bonds",
		"gold",
		"crypto",
		"cash",
		"alternatives",
		"real_estate",
		"commodities",
	],
};
import { describe, expect, it } from "vitest";
import { assetClassShock } from "../../shock-applicator.js";
import {
	BUILT_IN_SCENARIOS,
	type CrisisDefinition,
} from "../crisis-definitions.js";
describe("scenario provenance", () => {
	it("every built-in scenario carries a provenance block", () => {
		expect(BUILT_IN_SCENARIOS.length).toBe(15);
		for (const s of BUILT_IN_SCENARIOS) {
			expect(s.provenance, `${s.key} must declare provenance`).toBeDefined();
		}
	});

	it("keys are unique and windows are valid ISO ranges", () => {
		const ISO = /^\d{4}-\d{2}-\d{2}$/;
		const keys = new Set<string>();
		for (const s of BUILT_IN_SCENARIOS) {
			expect(keys.has(s.key), `duplicate key ${s.key}`).toBe(false);
			keys.add(s.key);
			expect(ISO.test(s.dateFrom), `${s.key} dateFrom ISO`).toBe(true);
			expect(ISO.test(s.dateTo), `${s.key} dateTo ISO`).toBe(true);
			expect(s.dateFrom < s.dateTo, `${s.key} window must run forward`).toBe(
				true,
			);
		}
	});

	it("every scenario covers the full sector, asset-class and currency key space", () => {
		const currencyKeys = ["CHF", "EUR", "GBP", "JPY", "USD"];
		for (const s of BUILT_IN_SCENARIOS) {
			for (const sector of [
				"Technology",
				"Healthcare",
				"Financials",
				"Consumer Discretionary",
				"Consumer Staples",
				"Industrials",
				"Energy",
				"Materials",
				"Utilities",
				"Real Estate",
				"Communication Services",
				"Other",
			]) {
				expect(
					s.sectorShocks[sector as keyof typeof s.sectorShocks],
					`${s.key} missing sector shock ${sector}`,
				).toBeDefined();
			}
			for (const assetClass of assetClassEnum.options) {
				expect(
					assetClassShock(s, assetClass),
					`${s.key} missing asset-class shock for enum member "${assetClass}"`,
				).toBeDefined();
			}
			for (const cur of currencyKeys) {
				expect(
					s.currencyShocks[cur],
					`${s.key} missing currency shock ${cur}`,
				).toBeDefined();
			}
		}
	});
	const EXPECTED_WINDOWS: Record<string, [string, string]> = {
		gfc_2008: ["2007-10-09", "2009-03-09"],
		covid_2020: ["2020-02-19", "2020-03-23"],
		rate_hike_2022: ["2022-01-03", "2022-10-12"],
		euro_crisis_2011: ["2011-05-02", "2011-10-04"],
		dotcom_2000: ["2000-03-10", "2002-10-09"],
		black_monday_1987: ["1987-08-25", "1987-12-04"],
		gulf_war_1990: ["1990-07-16", "1990-10-11"],
		bond_massacre_1994: ["1994-02-04", "1994-11-07"],
		asian_crisis_1997: ["1997-07-02", "1997-10-27"],
		russia_ltcm_1998: ["1998-07-17", "1998-10-08"],
		september_2001: ["2001-09-10", "2001-09-21"],
		china_shock_2015: ["2015-08-10", "2016-02-11"],
		q4_2018: ["2018-09-20", "2018-12-24"],
		banking_stress_2023: ["2023-03-06", "2023-05-04"],
		yen_carry_2024: ["2024-07-16", "2024-08-05"],
	};

	it("every scenario window matches its known-answer pin (ungated CI check)", () => {
		expect(Object.keys(EXPECTED_WINDOWS).sort()).toEqual(
			BUILT_IN_SCENARIOS.map((s) => s.key).sort(),
		);
		for (const s of BUILT_IN_SCENARIOS) {
			const expected = EXPECTED_WINDOWS[s.key];
			expect(expected, `${s.key} has no known-answer window`).toBeDefined();
			if (!expected) continue;
			expect([s.dateFrom, s.dateTo], `${s.key} window drifted`).toEqual(
				expected,
			);
		}
	});

	it("every scenario is flagged machine-readably as approximate", () => {
		for (const s of BUILT_IN_SCENARIOS) {
			expect(
				s.provenance?.approximate,
				`${s.key} shocks are hand-entered approximations — must be flagged`,
			).toBe(true);
		}
	});

	it("every scenario cites at least one published source and a methodology", () => {
		for (const s of BUILT_IN_SCENARIOS) {
			const p = s.provenance;
			expect(p, `${s.key} must declare provenance`).toBeDefined();
			if (!p) continue;
			expect(
				p.sources.length,
				`${s.key} must cite ≥1 published source`,
			).toBeGreaterThan(0);
			for (const src of p.sources) {
				expect(
					src.trim().length,
					`${s.key} source must be non-empty`,
				).toBeGreaterThan(0);
			}
			expect(
				p.methodology.trim().length,
				`${s.key} must document its methodology`,
			).toBeGreaterThan(0);
		}
	});

	it("every scenario records an ISO review date", () => {
		const ISO = /^\d{4}-\d{2}-\d{2}$/;
		for (const s of BUILT_IN_SCENARIOS) {
			expect(
				ISO.test(s.provenance?.reviewedAt ?? ""),
				`${s.key} reviewedAt must be YYYY-MM-DD`,
			).toBe(true);
		}
	});

	it("GFC_2008 cites the documented −0.57 peak-to-trough and references S&P 500 / MSCI", () => {
		const gfc = BUILT_IN_SCENARIOS.find((s) => s.key === "gfc_2008");
		expect(gfc).toBeDefined();
		expect(gfc!.peakToTroughPct).toBeCloseTo(-0.57, 2);
		const joined = (gfc!.provenance?.sources ?? []).join(" ").toLowerCase();
		expect(joined).toMatch(/s&p 500|msci/);
	});

	it("provenance does not fabricate precision — shocks remain clamped ≥ −100%", () => {
		for (const s of BUILT_IN_SCENARIOS) {
			const allShocks = [
				...Object.values(s.sectorShocks),
				...Object.values(s.assetClassShocks),
			];
			for (const shock of allShocks) {
				expect(
					shock,
					`${s.key} shock ${shock} must be ≥ −1 (a holding cannot lose >100%)`,
				).toBeGreaterThanOrEqual(-1);
			}
		}
	});

	it("the provenance type is structurally complete (compile-time + runtime spot check)", () => {
		const sample: CrisisDefinition = BUILT_IN_SCENARIOS[0]!;
		const p = sample.provenance;
		expect(p).toBeDefined();
		if (!p) return;
		expect(typeof p.approximate).toBe("boolean");
		expect(Array.isArray(p.sources)).toBe(true);
		expect(typeof p.methodology).toBe("string");
		expect(typeof p.reviewedAt).toBe("string");
	});
});
