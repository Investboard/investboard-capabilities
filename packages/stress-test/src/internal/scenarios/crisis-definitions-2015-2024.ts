import type { CrisisDefinition } from "./crisis-definitions.js";
import { EXTENDED_PROVENANCE_REVIEWED_AT } from "./crisis-definitions-1987-2001.js";
export const CHINA_SHOCK_2015: CrisisDefinition = {
	key: "china_shock_2015",
	name: {
		de: "China-Schock 2015",
		en: "China Shock 2015",
	},
	description: {
		de: "Die überraschende Yuan-Abwertung und Zweifel am chinesischen Wachstum drückten Rohstoffe und Aktien in zwei Wellen bis Februar 2016.",
		en: "The surprise yuan devaluation and doubts about Chinese growth pushed commodities and equities down in two waves into February 2016.",
	},
	crisisType: "correction",
	dateFrom: "2015-08-10",
	dateTo: "2016-02-11",
	peakToTroughPct: -0.13,
	recoveryMonths: 5,
	sectorShocks: {
		Technology: -0.12,
		Healthcare: -0.12,
		Financials: -0.18,
		"Consumer Discretionary": -0.1,
		"Consumer Staples": -0.02,
		Industrials: -0.12,
		Energy: -0.25,
		Materials: -0.2,
		Utilities: 0.05,
		"Real Estate": -0.05,
		"Communication Services": -0.08,
		Other: -0.13,
	},
	assetClassShocks: {
		equities: -0.13,
		etf: -0.13, // Most retail ETFs are equity-heavy; mirror equities baseline when no sector look-through is available
		bonds: 0.03,
		gold: 0.15,
		crypto: 0.4,
		cash: 0,
		alternatives: -0.08,
	},
	currencyShocks: {
		EUR: 0,
		USD: 0.02,
		GBP: -0.05,
		CHF: 0.02,
		JPY: 0.08,
	},
	provenance: {
		approximate: true,
		methodology:
			"Window runs from the last close before the PBoC devaluation (2015-08-10) to the S&P 500 trough (2016-02-11, 1829.08; ≈ −13.1% from 2104.18). Energy/Materials worst on oil near 26 USD; Utilities positive as rates fell; gold +0.15 approximates its early-2016 rally. Crypto +0.40 approximates bitcoin's rise over the window (≈ 264 → 378 USD), a reminder that it decoupled from this equity episode. Not a backtest of the user's holdings.",
		sources: [
			"S&P 500 index, 2015-08-10 → 2016-02-11 trough (≈ −13%) · https://www.spglobal.com/spdji/en/indices/equity/sp-500/",
			"PBoC yuan fixing devaluation 2015-08-11 · https://www.bis.org/publ/qtrpdf/r_qt1509.htm",
			"Bitcoin price history Aug 2015 – Feb 2016 · https://coinmarketcap.com/currencies/bitcoin/",
		],
		reviewedAt: EXTENDED_PROVENANCE_REVIEWED_AT,
	},
};
export const Q4_2018: CrisisDefinition = {
	key: "q4_2018",
	name: {
		de: "Zinsangst Q4 2018",
		en: "Q4 2018 Rate Scare",
	},
	description: {
		de: "Straffere Fed-Rhetorik und Handelsstreit drückten den Markt bis Heiligabend an die Schwelle zum Bärenmarkt. Der Kurswechsel der Fed beendete die Korrektur abrupt.",
		en: "Hawkish Fed rhetoric and the trade dispute pushed the market to the edge of bear territory by Christmas Eve. The Fed's pivot ended the correction abruptly.",
	},
	crisisType: "rate_shock",
	dateFrom: "2018-09-20",
	dateTo: "2018-12-24",
	peakToTroughPct: -0.2,
	recoveryMonths: 4,
	sectorShocks: {
		Technology: -0.23,
		Healthcare: -0.15,
		Financials: -0.22,
		"Consumer Discretionary": -0.2,
		"Consumer Staples": -0.1,
		Industrials: -0.22,
		Energy: -0.3,
		Materials: -0.2,
		Utilities: -0.03,
		"Real Estate": -0.12,
		"Communication Services": -0.2,
		Other: -0.2,
	},
	assetClassShocks: {
		equities: -0.2,
		etf: -0.2, // Most retail ETFs are equity-heavy; mirror equities baseline when no sector look-through is available
		bonds: 0.02,
		gold: 0.05,
		crypto: -0.5,
		cash: 0,
		alternatives: -0.1,
	},
	currencyShocks: {
		EUR: 0,
		USD: 0.02,
		GBP: -0.02,
		CHF: 0.02,
		JPY: 0.04,
	},
	provenance: {
		approximate: true,
		methodology:
			"Headline −0.20 is the S&P 500 peak-to-trough (2018-09-20 close 2930.75 → 2018-12-24 close 2351.10, ≈ −19.8%). Energy worst on the concurrent ≈ −40% oil slide; Utilities nearly flat. Crypto −0.50 approximates bitcoin's November–December 2018 break (≈ 6,400 → 3,200 USD). Not a backtest of the user's holdings.",
		sources: [
			"S&P 500 index, peak 2018-09-20 → trough 2018-12-24 (≈ −19.8%) · https://www.spglobal.com/spdji/en/indices/equity/sp-500/",
			"WTI crude Oct–Dec 2018 slide (≈ −40%) · https://www.eia.gov/dnav/pet/hist/RWTCD.htm",
			"Bitcoin price history Nov–Dec 2018 · https://coinmarketcap.com/currencies/bitcoin/",
		],
		reviewedAt: EXTENDED_PROVENANCE_REVIEWED_AT,
	},
};
export const BANKING_STRESS_2023: CrisisDefinition = {
	key: "banking_stress_2023",
	name: {
		de: "Bankenstress 2023",
		en: "Banking Stress 2023",
	},
	description: {
		de: "Der Zusammenbruch der Silicon Valley Bank, die Notübernahme der Credit Suisse und der Fall der First Republic trafen Bankaktien hart. Der breite Markt blieb vergleichsweise ruhig.",
		en: "The collapse of Silicon Valley Bank, the emergency takeover of Credit Suisse and the fall of First Republic hit bank stocks hard. The broad market stayed comparatively calm.",
	},
	crisisType: "financial_crisis",
	dateFrom: "2023-03-06",
	dateTo: "2023-05-04",
	peakToTroughPct: -0.07,
	recoveryMonths: 3,
	sectorShocks: {
		Technology: 0.05,
		Healthcare: -0.05,
		Financials: -0.3,
		"Consumer Discretionary": 0,
		"Consumer Staples": 0,
		Industrials: -0.05,
		Energy: -0.12,
		Materials: -0.08,
		Utilities: -0.03,
		"Real Estate": -0.15,
		"Communication Services": 0.03,
		Other: -0.07,
	},
	assetClassShocks: {
		equities: -0.07,
		etf: -0.07, // Most retail ETFs are equity-heavy; mirror equities baseline when no sector look-through is available
		bonds: 0.03,
		gold: 0.1,
		crypto: 0.3,
		cash: 0,
		alternatives: -0.05,
	},
	currencyShocks: {
		EUR: 0,
		USD: -0.03,
		GBP: 0.02,
		CHF: -0.02,
		JPY: 0.03,
	},
	provenance: {
		approximate: true,
		methodology:
			"Window dated by the US regional-bank index (last close before the SVB run, 2023-03-06, to the post-First-Republic trough, 2023-05-04; KBW regional banking index ≈ −35% over the span), not by a broad-market trough. Headline −0.07 approximates the S&P 500's worst drawdown inside the window; Financials −0.30 and Real Estate −0.15 carry the stress, mega-cap Technology was positive as yields fell. Gold +0.10 and crypto +0.30 approximate their rallies over the same span. Not a backtest of the user's holdings.",
		sources: [
			"FDIC, failure of Silicon Valley Bank (2023-03-10) and First Republic (2023-05-01) · https://www.fdic.gov/bank-failures/failed-bank-list",
			"KBW Nasdaq Regional Banking Index, Mar–May 2023 drawdown · https://indexes.nasdaqomx.com/Index/Overview/KRX",
			"Swiss authorities, Credit Suisse takeover by UBS (2023-03-19) · https://www.snb.ch/en/mmr/reference/pre_20230319/source/pre_20230319.en.pdf",
		],
		reviewedAt: EXTENDED_PROVENANCE_REVIEWED_AT,
	},
};
export const YEN_CARRY_2024: CrisisDefinition = {
	key: "yen_carry_2024",
	name: {
		de: "Yen-Carry-Auflösung 2024",
		en: "Yen Carry Unwind 2024",
	},
	description: {
		de: "Die Zinserhöhung der Bank of Japan löste kreditfinanzierte Yen-Positionen abrupt auf. Der Nikkei verlor an einem Tag über zwölf Prozent, die Erholung folgte binnen Wochen.",
		en: "The Bank of Japan's rate hike unwound leveraged yen positions abruptly. The Nikkei lost over twelve percent in a single day; the recovery followed within weeks.",
	},
	crisisType: "currency_crisis",
	dateFrom: "2024-07-16",
	dateTo: "2024-08-05",
	peakToTroughPct: -0.09,
	recoveryMonths: 2,
	sectorShocks: {
		Technology: -0.15,
		Healthcare: -0.03,
		Financials: -0.08,
		"Consumer Discretionary": -0.1,
		"Consumer Staples": -0.01,
		Industrials: -0.08,
		Energy: -0.08,
		Materials: -0.08,
		Utilities: 0.02,
		"Real Estate": 0,
		"Communication Services": -0.1,
		Other: -0.09,
	},
	assetClassShocks: {
		equities: -0.09,
		etf: -0.09, // Most retail ETFs are equity-heavy; mirror equities baseline when no sector look-through is available
		bonds: 0.02,
		gold: -0.02,
		crypto: -0.25,
		cash: 0,
		alternatives: -0.05,
	},
	currencyShocks: {
		EUR: 0,
		USD: -0.04,
		GBP: -0.02,
		CHF: 0.03,
		JPY: 0.1,
	},
	provenance: {
		approximate: true,
		methodology:
			"Headline −0.09 is the S&P 500 peak-to-trough (2024-07-16 close 5667.20 → 2024-08-05 close 5186.33, ≈ −8.5%); the Nikkei 225 fell −12.4% on 2024-08-05 alone. Semiconductor-heavy Technology worst; defensives nearly flat. JPY +0.10 approximates the yen's surge (USD/JPY ≈ 161 → 142); crypto −0.25 approximates bitcoin's drop over the window. Not a backtest of the user's holdings.",
		sources: [
			"S&P 500 index, peak 2024-07-16 → trough 2024-08-05 (≈ −8.5%) · https://www.spglobal.com/spdji/en/indices/equity/sp-500/",
			"Nikkei 225, 2024-08-05 session (−12.4%) · https://indexes.nikkei.co.jp/en/nkave",
			"Bank of Japan policy rate decision 2024-07-31 · https://www.boj.or.jp/en/mopo/mpmdeci/index.htm",
		],
		reviewedAt: EXTENDED_PROVENANCE_REVIEWED_AT,
	},
};
