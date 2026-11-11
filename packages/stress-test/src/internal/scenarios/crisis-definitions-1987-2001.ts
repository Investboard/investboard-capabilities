import type { CrisisDefinition } from "./crisis-definitions.js";
export const EXTENDED_PROVENANCE_REVIEWED_AT = "2026-07-20" as const;
/**
 * The day the USD, GBP, CHF and JPY moves of the ten scenarios since 1999 were
 * computed from the ECB euro foreign exchange reference rates. The five
 * scenarios before the euro have no euro reference rate and carry no such date.
 */
export const SCENARIO_CURRENCY_REVIEWED_AT = "2026-11-11" as const;
export const BLACK_MONDAY_1987: CrisisDefinition = {
	key: "black_monday_1987",
	name: {
		de: "Schwarzer Montag 1987",
		en: "Black Monday 1987",
	},
	description: {
		de: "Der größte Tagesverlust der US-Börsengeschichte am 19. Oktober 1987, ausgelöst durch Programmhandel und Portfolioversicherung. Die Erholung folgte vergleichsweise schnell.",
		en: "The largest single-day loss in US market history on October 19, 1987, driven by program trading and portfolio insurance. The recovery followed comparatively quickly.",
	},
	crisisType: "crash",
	dateFrom: "1987-08-25",
	dateTo: "1987-12-04",
	peakToTroughPct: -0.34,
	recoveryMonths: 20,
	sectorShocks: {
		Technology: -0.36,
		Healthcare: -0.3,
		Financials: -0.4,
		"Consumer Discretionary": -0.35,
		"Consumer Staples": -0.28,
		Industrials: -0.35,
		Energy: -0.32,
		Materials: -0.34,
		Utilities: -0.25,
		"Real Estate": -0.3,
		"Communication Services": -0.3,
		Other: -0.34,
	},
	assetClassShocks: {
		equities: -0.34,
		etf: -0.34, // Most retail ETFs are equity-heavy; mirror equities baseline when no sector look-through is available
		bonds: 0.05,
		gold: 0.05,
		cash: 0,
		alternatives: -0.15,
	},
	currencyShocks: {
		EUR: 0,
		USD: -0.08,
		GBP: 0.03,
		CHF: 0.06,
		JPY: 0.08,
	},
	provenance: {
		approximate: true,
		methodology:
			"Headline −0.34 is the S&P 500 peak-to-trough (1987-08-25 close 336.77 → 1987-12-04 close 223.92, ≈ −33.5%), including the −20.5% single day on 1987-10-19. Sector shocks are rounded approximations of the broadly uniform crash dispersion (rate-sensitive Financials worst, defensive Utilities/Staples least). Bonds positive reflects the post-crash flight to Treasuries and falling yields; USD negative reflects the post-Louvre dollar slide into year-end 1987. Crypto has no figure of its own in this window and takes the shares figure as a stand-in, a scenario assumption rather than a measured crypto move. Not a backtest of the user's holdings.",
		sources: [
			"S&P 500 index, peak 1987-08-25 → trough 1987-12-04 (≈ −33.5%) · https://www.spglobal.com/spdji/en/indices/equity/sp-500/",
			"Federal Reserve History, Stock Market Crash of 1987 · https://www.federalreservehistory.org/essays/stock-market-crash-of-1987",
		],
		reviewedAt: EXTENDED_PROVENANCE_REVIEWED_AT,
	},
};
export const GULF_WAR_1990: CrisisDefinition = {
	key: "gulf_war_1990",
	name: {
		de: "Golfkrieg 1990",
		en: "Gulf War 1990",
	},
	description: {
		de: "Die Invasion Kuwaits verdoppelte den Ölpreis und traf Aktien mitten in einer US-Rezession. Energie war der einzige Gewinner.",
		en: "The invasion of Kuwait doubled the oil price and hit equities in the middle of a US recession. Energy was the only winner.",
	},
	crisisType: "geopolitical",
	dateFrom: "1990-07-16",
	dateTo: "1990-10-11",
	peakToTroughPct: -0.2,
	recoveryMonths: 7,
	sectorShocks: {
		Technology: -0.25,
		Healthcare: -0.12,
		Financials: -0.3,
		"Consumer Discretionary": -0.28,
		"Consumer Staples": -0.1,
		Industrials: -0.22,
		Energy: 0.1,
		Materials: -0.2,
		Utilities: -0.1,
		"Real Estate": -0.25,
		"Communication Services": -0.18,
		Other: -0.2,
	},
	assetClassShocks: {
		equities: -0.2,
		etf: -0.2, // Most retail ETFs are equity-heavy; mirror equities baseline when no sector look-through is available
		bonds: 0,
		gold: 0.07,
		cash: 0,
		alternatives: -0.1,
	},
	currencyShocks: {
		EUR: 0,
		USD: -0.1,
		GBP: 0.08,
		CHF: 0.08,
		JPY: 0.05,
	},
	provenance: {
		approximate: true,
		methodology:
			"Headline −0.20 is the S&P 500 peak-to-trough (1990-07-16 close 368.95 → 1990-10-11 close 295.46, ≈ −19.9%). Energy +0.10 approximates the sector's gain as WTI roughly doubled after 1990-08-02; Financials worst on the concurrent S&L overhang. USD −0.10 approximates the dollar's slide against the D-Mark through 1990. Crypto has no figure of its own in this window and takes the shares figure as a stand-in, a scenario assumption rather than a measured crypto move. Not a backtest of the user's holdings.",
		sources: [
			"S&P 500 index, peak 1990-07-16 → trough 1990-10-11 (≈ −19.9%) · https://www.spglobal.com/spdji/en/indices/equity/sp-500/",
			"WTI crude spot doubling Aug–Oct 1990 · https://www.eia.gov/dnav/pet/hist/RWTCD.htm",
			"NBER US recession dating, Jul 1990 – Mar 1991 · https://www.nber.org/research/business-cycle-dating",
		],
		reviewedAt: EXTENDED_PROVENANCE_REVIEWED_AT,
	},
};
export const BOND_MASSACRE_1994: CrisisDefinition = {
	key: "bond_massacre_1994",
	name: {
		de: "Anleihencrash 1994",
		en: "Bond Massacre 1994",
	},
	description: {
		de: "Überraschende Zinserhöhungen der Fed trafen Anleihen härter als Aktien: das bis dahin schlechteste Anleihenjahr der Nachkriegszeit.",
		en: "Surprise Fed rate hikes hit bonds harder than equities: the worst post-war year for bonds until then.",
	},
	crisisType: "rate_shock",
	dateFrom: "1994-02-04",
	dateTo: "1994-11-07",
	peakToTroughPct: -0.09,
	recoveryMonths: 14,
	sectorShocks: {
		Technology: -0.08,
		Healthcare: -0.06,
		Financials: -0.1,
		"Consumer Discretionary": -0.1,
		"Consumer Staples": -0.05,
		Industrials: -0.08,
		Energy: -0.05,
		Materials: -0.08,
		Utilities: -0.17,
		"Real Estate": -0.15,
		"Communication Services": -0.1,
		Other: -0.09,
	},
	assetClassShocks: {
		equities: -0.09,
		etf: -0.09, // Most retail ETFs are equity-heavy; mirror equities baseline when no sector look-through is available
		bonds: -0.08,
		gold: -0.02,
		cash: 0,
		alternatives: -0.05,
	},
	currencyShocks: {
		EUR: 0,
		USD: -0.1,
		GBP: 0.02,
		CHF: 0.08,
		JPY: 0.1,
	},
	provenance: {
		approximate: true,
		methodology:
			"Window dated by the 1994 Fed tightening cycle (first hike 1994-02-04; +250bp over the year), not an equity trough. Equity −0.09 approximates the S&P 500 Feb–Apr drawdown; bonds −0.08 approximates long-duration Treasury losses (10y yield 5.6% → 8.0%; 30y total returns ≈ −12%, aggregate ≈ −5%). Utilities/Real Estate worst as bond proxies. USD −0.10 approximates the 1994 dollar slide against the yen and D-Mark. Crypto has no figure of its own in this window and takes the shares figure as a stand-in, a scenario assumption rather than a measured crypto move. Not a backtest of the user's holdings.",
		sources: [
			"Federal Reserve, 1994 rate decisions (Feb 4 first hike; +250bp cycle) · https://www.federalreserve.gov/monetarypolicy/openmarket_archive.htm",
			"US 10y Treasury constant-maturity yield, 1994 (≈ 5.6% → 8.0%) · https://fred.stlouisfed.org/series/DGS10",
		],
		reviewedAt: EXTENDED_PROVENANCE_REVIEWED_AT,
	},
};
export const ASIAN_CRISIS_1997: CrisisDefinition = {
	key: "asian_crisis_1997",
	name: {
		de: "Asienkrise 1997",
		en: "Asian Crisis 1997",
	},
	description: {
		de: "Die Freigabe des thailändischen Baht löste eine Abwertungswelle in Asien aus. Westliche Märkte spürten den Höhepunkt im Oktober-Minicrash.",
		en: "Floating the Thai baht set off a wave of devaluations across Asia. Western markets felt the peak in the October mini-crash.",
	},
	crisisType: "currency_crisis",
	dateFrom: "1997-07-02",
	dateTo: "1997-10-27",
	peakToTroughPct: -0.11,
	recoveryMonths: 3,
	sectorShocks: {
		Technology: -0.12,
		Healthcare: -0.06,
		Financials: -0.15,
		"Consumer Discretionary": -0.1,
		"Consumer Staples": -0.06,
		Industrials: -0.12,
		Energy: -0.1,
		Materials: -0.12,
		Utilities: -0.05,
		"Real Estate": -0.08,
		"Communication Services": -0.08,
		Other: -0.11,
	},
	assetClassShocks: {
		equities: -0.11,
		etf: -0.11, // Most retail ETFs are equity-heavy; mirror equities baseline when no sector look-through is available
		bonds: 0.03,
		gold: -0.08,
		cash: 0,
		alternatives: -0.08,
	},
	currencyShocks: {
		EUR: 0,
		USD: 0.03,
		GBP: 0.02,
		CHF: 0.02,
		JPY: -0.05,
	},
	provenance: {
		approximate: true,
		methodology:
			"Window runs from the Thai baht float (1997-07-02) to the US spillover trough (1997-10-27, Dow −7.2% in one session). Headline −0.11 approximates the S&P 500 drawdown into that session; Asian markets fell far more, but the shock table models the DACH retail universe (US/EU-heavy). Gold −0.08 reflects its decline through the crisis autumn; JPY −0.05 the yen's 1997 weakness. Crypto has no figure of its own in this window and takes the shares figure as a stand-in, a scenario assumption rather than a measured crypto move. Not a backtest of the user's holdings.",
		sources: [
			"S&P 500 / DJIA, 1997-10-27 session (−7.2% DJIA, trading halts) · https://www.spglobal.com/spdji/en/indices/equity/sp-500/",
			"IMF, Recovery from the Asian Crisis · https://www.imf.org/external/np/exr/ib/2000/062300.htm",
		],
		reviewedAt: EXTENDED_PROVENANCE_REVIEWED_AT,
	},
};
export const RUSSIA_LTCM_1998: CrisisDefinition = {
	key: "russia_ltcm_1998",
	name: {
		de: "Russland und LTCM 1998",
		en: "Russia / LTCM 1998",
	},
	description: {
		de: "Russlands Zahlungsausfall und der Beinahe-Kollaps des Hedgefonds LTCM ließen die Risikoprämien springen. Die Fed organisierte eine private Rettung, die Erholung war schnell.",
		en: "Russia's default and the near-collapse of the LTCM hedge fund sent risk premia jumping. The Fed organized a private rescue and the recovery was fast.",
	},
	crisisType: "financial_crisis",
	dateFrom: "1998-07-17",
	dateTo: "1998-10-08",
	peakToTroughPct: -0.19,
	recoveryMonths: 2,
	sectorShocks: {
		Technology: -0.2,
		Healthcare: -0.1,
		Financials: -0.3,
		"Consumer Discretionary": -0.2,
		"Consumer Staples": -0.12,
		Industrials: -0.2,
		Energy: -0.25,
		Materials: -0.22,
		Utilities: -0.05,
		"Real Estate": -0.2,
		"Communication Services": -0.15,
		Other: -0.19,
	},
	assetClassShocks: {
		equities: -0.19,
		etf: -0.19, // Most retail ETFs are equity-heavy; mirror equities baseline when no sector look-through is available
		bonds: 0.04,
		gold: 0,
		cash: 0,
		alternatives: -0.2,
	},
	currencyShocks: {
		EUR: 0,
		USD: -0.08,
		GBP: 0,
		CHF: 0.05,
		JPY: 0.15,
	},
	provenance: {
		approximate: true,
		methodology:
			"Headline −0.19 is the S&P 500 peak-to-trough (1998-07-17 close 1186.75 → 1998-10-08 close 959.44, ≈ −19.2%). Financials and alternatives worst (bank LTCM exposure; hedge-fund deleveraging), Energy hit by oil near 11 USD. Bonds positive on the flight to Treasuries; JPY +0.15 approximates the violent October 1998 yen-carry unwind (USD/JPY ≈ 135 → 115). Crypto has no figure of its own in this window and takes the shares figure as a stand-in, a scenario assumption rather than a measured crypto move. Not a backtest of the user's holdings.",
		sources: [
			"S&P 500 index, peak 1998-07-17 → trough 1998-10-08 (≈ −19%) · https://www.spglobal.com/spdji/en/indices/equity/sp-500/",
			"Federal Reserve History, Near failure of LTCM · https://www.federalreservehistory.org/essays/ltcm-near-failure",
		],
		reviewedAt: EXTENDED_PROVENANCE_REVIEWED_AT,
	},
};
export const SEPTEMBER_2001: CrisisDefinition = {
	key: "september_2001",
	name: {
		de: "September 2001",
		en: "September 2001",
	},
	description: {
		de: "Nach den Anschlägen vom 11. September blieben die US-Börsen vier Tage geschlossen und fielen danach deutlich. Die Kurse erholten sich innerhalb weniger Wochen.",
		en: "After the September 11 attacks, US exchanges closed for four days and fell sharply on reopening. Prices recovered within a few weeks.",
	},
	crisisType: "geopolitical",
	dateFrom: "2001-09-10",
	dateTo: "2001-09-21",
	peakToTroughPct: -0.12,
	recoveryMonths: 2,
	sectorShocks: {
		Technology: -0.15,
		Healthcare: -0.05,
		Financials: -0.15,
		"Consumer Discretionary": -0.15,
		"Consumer Staples": -0.03,
		Industrials: -0.2,
		Energy: -0.05,
		Materials: -0.1,
		Utilities: -0.08,
		"Real Estate": -0.1,
		"Communication Services": -0.1,
		Other: -0.12,
	},
	assetClassShocks: {
		equities: -0.12,
		etf: -0.12, // Most retail ETFs are equity-heavy; mirror equities baseline when no sector look-through is available
		bonds: 0.02,
		gold: 0.06,
		cash: 0,
		alternatives: -0.05,
	},
	currencyShocks: {
		EUR: 0,
		USD: -0.02,
		GBP: -0.02,
		CHF: 0.05,
		JPY: 0.02,
	},
	provenance: {
		approximate: true,
		methodology:
			"Headline −0.12 is the S&P 500 move from the last pre-attack close (2001-09-10, 1092.54) to the post-reopening trough (2001-09-21, 965.80, ≈ −11.6%). Industrials worst on airlines, Financials on insurers; defensive Staples nearly flat. Gold and CHF positive as classic haven moves. Currency moves are each currency's move against the euro, computed from the ECB euro foreign exchange reference rates on 2001-09-10 and 2001-09-21 (start rate / end rate - 1, rounded to two decimals; checked 2026-11-11). Sector and asset-class figures remain approximations. Crypto has no figure of its own in this window and takes the shares figure as a stand-in, a scenario assumption rather than a measured crypto move. Not a backtest of the user's holdings.",
		sources: [
			"S&P 500 index, 2001-09-10 → 2001-09-21 (≈ −11.6%) · https://www.spglobal.com/spdji/en/indices/equity/sp-500/",
			"NYSE closure 2001-09-11 → 2001-09-17 (longest since 1933) · https://www.federalreservehistory.org/essays/september-11-attacks",
			"ECB euro foreign exchange reference rates, 2001-09-10 and 2001-09-21 (currency moves against the euro) · https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
		],
		reviewedAt: EXTENDED_PROVENANCE_REVIEWED_AT,
		currencyReviewedAt: SCENARIO_CURRENCY_REVIEWED_AT,
	},
};
