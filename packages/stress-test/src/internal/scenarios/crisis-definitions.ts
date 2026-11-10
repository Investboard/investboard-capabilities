import type { StressTestSector } from "./sector-enum.js";
export interface ScenarioProvenance {
	readonly approximate: boolean;
	readonly methodology: string;
	readonly sources: readonly string[];
	readonly reviewedAt: `${number}-${number}-${number}`;
}
export interface CrisisDefinition {
	key: string; // stable identifier, e.g., "gfc_2008"
	name: { de: string; en: string };
	description: { de: string; en: string };
	crisisType: string;
	dateFrom: string; // YYYY-MM-DD
	dateTo: string; // YYYY-MM-DD
	peakToTroughPct: number; // negative, e.g., -0.57
	recoveryMonths: number | null;
	sectorShocks: Record<StressTestSector, number>; // -0.40 = -40%
	assetClassShocks: Record<string, number>; // e.g., { bonds: -0.05, gold: 0.25 }
	currencyShocks: Record<string, number>; // e.g., { EUR: 0, USD: -0.10 }
	provenance?: ScenarioProvenance;
}
const SCENARIO_PROVENANCE_REVIEWED_AT = "2026-05-31" as const;
const GFC_2008: CrisisDefinition = {
	key: "gfc_2008",
	name: {
		de: "Finanzkrise 2008",
		en: "Global Financial Crisis 2008",
	},
	description: {
		de: "Der schlimmste Boersencrash seit der Grossen Depression. Ausgeloest durch die Subprime-Hypothekenkrise in den USA.",
		en: "The worst market crash since the Great Depression. Triggered by the US subprime mortgage crisis.",
	},
	crisisType: "financial_crisis",
	dateFrom: "2007-10-09",
	dateTo: "2009-03-09",
	peakToTroughPct: -0.57,
	recoveryMonths: 48,
	sectorShocks: {
		Technology: -0.5,
		Healthcare: -0.38,
		Financials: -0.83,
		"Consumer Discretionary": -0.59,
		"Consumer Staples": -0.29,
		Industrials: -0.58,
		Energy: -0.55,
		Materials: -0.57,
		Utilities: -0.45,
		"Real Estate": -0.68,
		"Communication Services": -0.45,
		Other: -0.57,
	},
	assetClassShocks: {
		equities: -0.57,
		etf: -0.57, // Most retail ETFs are equity-heavy; mirror equities baseline when no sector look-through is available
		bonds: -0.05,
		gold: 0.25,
		crypto: 0,
		cash: 0,
		alternatives: -0.25,
	},
	currencyShocks: {
		EUR: 0,
		USD: -0.08,
		GBP: -0.25,
		CHF: 0.05,
		JPY: 0.2,
	},
	provenance: {
		approximate: true,
		methodology:
			"Headline −0.57 is the S&P 500 peak-to-trough (2007-10-09 close 1565.15 → 2009-03-09 close 676.53, ≈ −56.8%). Sector shocks are rounded approximations of MSCI/GICS sector index peak-to-trough over the same window; asset-class and currency shocks are rounded directional approximations from published cross-asset and FX moves. Not a backtest of the user's holdings.",
		sources: [
			"S&P 500 index, peak 2007-10-09 → trough 2009-03-09 (≈ −56.8%) — https://www.spglobal.com/spdji/en/indices/equity/sp-500/",
			"MSCI World / GICS sector indices, 2007–2009 drawdown — https://www.msci.com/end-of-day-data-search",
			"NBER US recession dating, Dec 2007 – Jun 2009 — https://www.nber.org/research/business-cycle-dating",
		],
		reviewedAt: SCENARIO_PROVENANCE_REVIEWED_AT,
	},
};
const COVID_2020: CrisisDefinition = {
	key: "covid_2020",
	name: {
		de: "COVID-19 Crash 2020",
		en: "COVID-19 Crash 2020",
	},
	description: {
		de: "Schnellster Baerseneinbruch der Geschichte durch die weltweite Pandemie. Erholung in Rekordzeit dank Notenbankinterventionen.",
		en: "Fastest market crash in history caused by the global pandemic. Record-fast recovery due to central bank intervention.",
	},
	crisisType: "pandemic",
	dateFrom: "2020-02-19",
	dateTo: "2020-03-23",
	peakToTroughPct: -0.34,
	recoveryMonths: 5,
	sectorShocks: {
		Technology: -0.25,
		Healthcare: -0.22,
		Financials: -0.42,
		"Consumer Discretionary": -0.38,
		"Consumer Staples": -0.18,
		Industrials: -0.4,
		Energy: -0.57,
		Materials: -0.3,
		Utilities: -0.28,
		"Real Estate": -0.35,
		"Communication Services": -0.27,
		Other: -0.34,
	},
	assetClassShocks: {
		equities: -0.34,
		etf: -0.34, // Most retail ETFs are equity-heavy; mirror equities baseline when no sector look-through is available
		bonds: 0.02,
		gold: -0.03,
		crypto: -0.4,
		cash: 0,
		alternatives: -0.15,
	},
	currencyShocks: {
		EUR: 0,
		USD: 0.05,
		GBP: -0.06,
		CHF: 0.02,
		JPY: 0.03,
	},
	provenance: {
		approximate: true,
		methodology:
			"Headline −0.34 is the S&P 500 peak-to-trough (2020-02-19 close 3386.15 → 2020-03-23 close 2237.40, ≈ −33.9%). Sector shocks are rounded approximations of the GICS sector index drops over the same five-week window (Energy worst on the oil-price collapse); asset-class and currency shocks are rounded directional approximations. Not a backtest of the user's holdings.",
		sources: [
			"S&P 500 index, peak 2020-02-19 → trough 2020-03-23 (≈ −33.9%) — https://www.spglobal.com/spdji/en/indices/equity/sp-500/",
			"S&P 500 GICS sector total returns, Feb–Mar 2020 — https://www.spglobal.com/spdji/en/index-family/equity/us-equity/sp-sectors/",
			"WTI crude collapse, Mar 2020 (Energy sector driver) — https://www.eia.gov/dnav/pet/hist/RWTCD.htm",
		],
		reviewedAt: SCENARIO_PROVENANCE_REVIEWED_AT,
	},
};
const RATE_HIKE_2022: CrisisDefinition = {
	key: "rate_hike_2022",
	name: {
		de: "Zinsschock 2022",
		en: "Rate Hike Shock 2022",
	},
	description: {
		de: "Aggressive Zinsanhebungen der Zentralbanken zur Bekaempfung der Inflation fuehrten zu Verlusten bei Aktien und Anleihen gleichzeitig.",
		en: "Aggressive central bank rate hikes to combat inflation caused simultaneous losses in stocks and bonds.",
	},
	crisisType: "rate_shock",
	dateFrom: "2022-01-03",
	dateTo: "2022-10-12",
	peakToTroughPct: -0.25,
	recoveryMonths: 14,
	sectorShocks: {
		Technology: -0.35,
		Healthcare: -0.12,
		Financials: -0.18,
		"Consumer Discretionary": -0.35,
		"Consumer Staples": -0.05,
		Industrials: -0.2,
		Energy: 0.3,
		Materials: -0.1,
		Utilities: -0.08,
		"Real Estate": -0.3,
		"Communication Services": -0.4,
		Other: -0.25,
	},
	assetClassShocks: {
		equities: -0.25,
		etf: -0.25, // Most retail ETFs are equity-heavy; mirror equities baseline when no sector look-through is available
		bonds: -0.15,
		gold: -0.03,
		crypto: -0.65,
		cash: 0,
		alternatives: -0.1,
	},
	currencyShocks: {
		EUR: -0.12,
		USD: 0.15,
		GBP: -0.1,
		CHF: 0.02,
		JPY: -0.2,
	},
	provenance: {
		approximate: true,
		methodology:
			"Headline −0.25 is the S&P 500 peak-to-trough (2022-01-03 close 4796.56 → 2022-10-12 close 3577.03, ≈ −25.4%). Sector shocks are rounded approximations reflecting the rate-shock dispersion (long-duration Technology/Communication worst, Energy positive); bonds −0.15 approximates the Bloomberg US Aggregate's record 2022 drawdown; FX shocks approximate the EUR/USD slide below parity. Not a backtest of the user's holdings.",
		sources: [
			"S&P 500 index, peak 2022-01-03 → trough 2022-10-12 (≈ −25.4%) — https://www.spglobal.com/spdji/en/indices/equity/sp-500/",
			"Bloomberg US Aggregate Bond Index 2022 total return ≈ −13% (worst on record) — https://www.bloomberg.com/markets/rates-bonds",
			"EUR/USD fell below parity, Sep 2022 — https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html",
		],
		reviewedAt: SCENARIO_PROVENANCE_REVIEWED_AT,
	},
};
const EURO_CRISIS_2011: CrisisDefinition = {
	key: "euro_crisis_2011",
	name: {
		de: "Eurokrise 2011",
		en: "European Debt Crisis 2011",
	},
	description: {
		de: "Staatsschuldenkrise in der Eurozone mit Griechenland, Irland und Portugal. Banken unter Druck, Euro unter Abwertungsdruck.",
		en: "Sovereign debt crisis in the Eurozone involving Greece, Ireland, and Portugal. Banks under pressure, Euro depreciating.",
	},
	crisisType: "sovereign_debt",
	dateFrom: "2011-05-02",
	dateTo: "2011-10-04",
	peakToTroughPct: -0.22,
	recoveryMonths: 12,
	sectorShocks: {
		Technology: -0.15,
		Healthcare: -0.1,
		Financials: -0.35,
		"Consumer Discretionary": -0.22,
		"Consumer Staples": -0.08,
		Industrials: -0.25,
		Energy: -0.18,
		Materials: -0.22,
		Utilities: -0.15,
		"Real Estate": -0.2,
		"Communication Services": -0.18,
		Other: -0.22,
	},
	assetClassShocks: {
		equities: -0.22,
		etf: -0.22, // Most retail ETFs are equity-heavy; mirror equities baseline when no sector look-through is available
		bonds: -0.08,
		gold: 0.15,
		crypto: 0,
		cash: 0,
		alternatives: -0.1,
	},
	currencyShocks: {
		EUR: -0.1,
		USD: 0.08,
		GBP: -0.02,
		CHF: 0.18,
		JPY: 0.05,
	},
	provenance: {
		approximate: true,
		methodology:
			"Headline −0.22 approximates the broad European equity peak-to-trough over the 2011 sovereign-debt sell-off (EURO STOXX 50 ≈ −28% intra-year; S&P 500 ≈ −19% 2011-05-02→2011-10-04). Financials worst on bank/sovereign contagion; CHF strongly positive (safe-haven, pre-SNB-floor). Asset-class and currency shocks are rounded directional approximations. Not a backtest of the user's holdings.",
		sources: [
			"EURO STOXX 50 index, 2011 drawdown — https://www.stoxx.com/index-details?symbol=SX5E",
			"S&P 500 index, peak 2011-05-02 → trough 2011-10-04 (≈ −19%) — https://www.spglobal.com/spdji/en/indices/equity/sp-500/",
			"SNB EUR/CHF 1.20 floor announced 2011-09-06 (CHF safe-haven strength) — https://www.snb.ch/en/mmr/reference/pre_20110906/source/pre_20110906.en.pdf",
		],
		reviewedAt: SCENARIO_PROVENANCE_REVIEWED_AT,
	},
};
const DOTCOM_2000: CrisisDefinition = {
	key: "dotcom_2000",
	name: {
		de: "Dotcom-Blase 2000",
		en: "Dotcom Bubble 2000",
	},
	description: {
		de: "Platzen der Technologieblase nach Jahren exzessiver Spekulation in Internetunternehmen. Langsamste Erholung im Katalog.",
		en: "Burst of the technology bubble after years of excessive speculation in internet companies. Slowest recovery in the catalog.",
	},
	crisisType: "bubble_burst",
	dateFrom: "2000-03-10",
	dateTo: "2002-10-09",
	peakToTroughPct: -0.49,
	recoveryMonths: 84,
	sectorShocks: {
		Technology: -0.78,
		Healthcare: -0.35,
		Financials: -0.22,
		"Consumer Discretionary": -0.45,
		"Consumer Staples": -0.1,
		Industrials: -0.38,
		Energy: -0.15,
		Materials: -0.2,
		Utilities: -0.55,
		"Real Estate": -0.12,
		"Communication Services": -0.7,
		Other: -0.49,
	},
	assetClassShocks: {
		equities: -0.49,
		etf: -0.49, // Most retail ETFs are equity-heavy; mirror equities baseline when no sector look-through is available
		bonds: 0.15,
		gold: 0.05,
		crypto: 0,
		cash: 0,
		alternatives: -0.05,
	},
	currencyShocks: {
		EUR: 0,
		USD: -0.05,
		GBP: -0.02,
		CHF: 0.03,
		JPY: 0.05,
	},
	provenance: {
		approximate: true,
		methodology:
			"Headline −0.49 is the S&P 500 peak-to-trough (2000-03-24 close 1527.46 → 2002-10-09 close 776.76, ≈ −49.1%). Technology −0.78 approximates the NASDAQ Composite's ≈ −78% collapse (5048.62 → 1114.11); other sector shocks are rounded approximations of the dispersion over the bubble unwind. Slowest recovery in the catalog. Not a backtest of the user's holdings.",
		sources: [
			"S&P 500 index, peak 2000-03-24 → trough 2002-10-09 (≈ −49%) — https://www.spglobal.com/spdji/en/indices/equity/sp-500/",
			"NASDAQ Composite, peak 2000-03-10 5048.62 → trough 2002-10-09 1114.11 (≈ −78%) — https://www.nasdaq.com/market-activity/index/comp",
		],
		reviewedAt: SCENARIO_PROVENANCE_REVIEWED_AT,
	},
};
import { EXTENDED_SCENARIOS } from "./crisis-definitions-extended.js";
export const BUILT_IN_SCENARIOS: readonly CrisisDefinition[] = [
	GFC_2008,
	COVID_2020,
	RATE_HIKE_2022,
	EURO_CRISIS_2011,
	DOTCOM_2000,
	...EXTENDED_SCENARIOS,
] as const;
