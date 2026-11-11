import { forAll } from "../support/property.js";
import { describe, expect, it } from "vitest";
import { classificationBuckets } from "../../src/internal/xray/classification-buckets.js";
import {
	type CurrencyFundInput,
	countryToCurrency,
	currencyExposure,
	hedgeOfFundName,
} from "../../src/internal/xray/currency-exposure.js";
function fund(
	value: number,
	countryVector: CurrencyFundInput["countryVector"],
	name = "Synthetic Core World UCITS ETF",
): CurrencyFundInput {
	return {
		id: "isin:IESYN4303130",
		label: name,
		isin: "IESYN4303130",
		value,
		countryVector,
		hedge: hedgeOfFundName(name),
	};
}
const bucket = (r: ReturnType<typeof currencyExposure>, key: string) =>
	r.buckets.find((b) => b.key === key);
describe("countryToCurrency", () => {
	it("maps every euro-area member to EUR, Bulgaria included since 2026", () => {
		for (const iso of ["DE", "FR", "NL", "IE", "IT", "ES", "HR", "BG", "LU"]) {
			expect(countryToCurrency(iso)).toBe("EUR");
		}
	});
	it("maps a home market to its own currency", () => {
		expect(countryToCurrency("US")).toBe("USD");
		expect(countryToCurrency("GB")).toBe("GBP");
		expect(countryToCurrency("JP")).toBe("JPY");
		expect(countryToCurrency("CH")).toBe("CHF");
		expect(countryToCurrency("CN")).toBe("CNY");
		expect(countryToCurrency("HK")).toBe("HKD");
		expect(countryToCurrency("us")).toBe("USD");
	});
	it("names no currency for an offshore registry or an unknown code", () => {
		for (const iso of ["BM", "KY", "JE", "GG", "VG", "IM", "CW"]) {
			expect(countryToCurrency(iso)).toBeNull();
		}
		expect(countryToCurrency("ZZ")).toBeNull();
		expect(countryToCurrency(null)).toBeNull();
		expect(countryToCurrency("")).toBeNull();
	});
});
describe("hedgeOfFundName", () => {
	it.each([
		["Synthetic Core World UCITS ETF EUR Hedged (Acc)", "EUR"],
		["Synthetic World UCITS ETF 2C - EUR Hedged", "EUR"],
		["Synthetic Global World UCITS ETF EUR Hdg", "EUR"],
		["Synthetic S&P 500 UCITS ETF EUR Hdg Acc", "EUR"],
		["UBS ETF (IE) Global USA UCITS ETF (hedged to EUR) A-acc", "EUR"],
		["UBS ETF (LU) Global Japan UCITS ETF (EUR) A-acc hedged", "EUR"],
		["ISHSII-S&P 500 EUR H.U.ETF", "EUR"],
		["Synthetic S&P 500 CHF Hedged UCITS ETF", "CHF"],
		["Synthetic All-World UCITS ETF GBP Hedged", "GBP"],
		["Synthetic Core S&P 500 UCITS ETF CAD Hedged", "CAD"],
		["Synthetic World UCITS ETF SEK Hedged Acc", "SEK"],
		["Synthetic Global Emerging Markets hedged to AUD", "AUD"],
		["ISHSIII-S+P500 DAILY H.EO", "EUR"],
		["ISHS-Global WLD EUR HD", "EUR"],
		["XTR.Global WORLD HEDG.EUR 1C", "EUR"],
		["Synthetic World UCITS ETF EUR Currency Hedged", "EUR"],
		["Global Welt ETF EUR waehrungsgesichert", "EUR"],
	])("reads %s as hedged into %s", (name, currency) => {
		expect(hedgeOfFundName(name)).toEqual({ currency });
	});
	it("reads a currency hedge that names no currency as hedged into none", () => {
		expect(hedgeOfFundName("Synthetic World Currency Hedged")).toEqual({
			currency: null,
		});
		expect(hedgeOfFundName("Global Welt ETF währungsgesichert")).toEqual({
			currency: null,
		});
	});
	it("never reads an unhedged fund, an option overlay or a bond label as a currency hedge", () => {
		expect(hedgeOfFundName("Synthetic Core World UCITS ETF")).toBeNull();
		expect(hedgeOfFundName("JPMorgan US Hedged Equity UCITS ETF")).toBeNull();
		expect(
			hedgeOfFundName("JPM US Hedged Equity Active UCITS ETF (USD)"),
		).toBeNull();
		expect(hedgeOfFundName("Synthetic EUR High Yield Corp Bond")).toBeNull();
		expect(hedgeOfFundName("Synthetic All-World UCITS ETF")).toBeNull();
		expect(hedgeOfFundName(null)).toBeNull();
	});
});
describe("currencyExposure", () => {
	it("reads a world fund through its holdings, never by its trading currency", () => {
		const r = currencyExposure({
			funds: [
				fund(100000, [
					{ key: "US", weight: 0.7 },
					{ key: "DE", weight: 0.05 },
					{ key: "FR", weight: 0.05 },
					{ key: "JP", weight: 0.06 },
					{ key: "GB", weight: 0.04 },
				]),
			],
			direct: [],
			totalValue: 100000,
		});
		expect(bucket(r, "USD")?.weight).toBeCloseTo(0.7, 4);
		expect(bucket(r, "EUR")?.weight).toBeCloseTo(0.1, 4);
		expect(bucket(r, "JPY")?.weight).toBeCloseTo(0.06, 4);
		expect(bucket(r, "unknown")?.weight).toBeCloseTo(0.1, 4);
		expect(r.buckets.at(-1)?.key).toBe("unknown");
		expect(r.coverage).toBeCloseTo(0.9, 6);
		expect(bucket(r, "USD")?.contributors.map((c) => c.id)).toEqual([
			"isin:IESYN4303130",
		]);
	});
	it("counts Alder bought on Xetra in euros as US dollar", () => {
		const r = currencyExposure({
			funds: [],
			direct: [
				{
					id: "isin:US1111111005",
					label: "Alder (Xetra)",
					isin: "US1111111005",
					value: 5000,
					country: "US",
				},
			],
			totalValue: 5000,
		});
		expect(r.buckets.map((b) => b.key)).toEqual(["USD"]);
		expect(r.coverage).toBe(1);
	});
	it("counts a fund hedged into euros wholly in euros and lists it", () => {
		const r = currencyExposure({
			funds: [
				fund(
					40000,
					[{ key: "US", weight: 1 }],
					"Synthetic Core World UCITS ETF EUR Hedged (Acc)",
				),
			],
			direct: [],
			totalValue: 40000,
		});
		expect(r.buckets.map((b) => b.key)).toEqual(["EUR"]);
		expect(r.hedged).toEqual([
			expect.objectContaining({ currency: "EUR", value: 40000, weight: 1 }),
		]);
	});
	it("applies a name hedge only to a fund it looks through", () => {
		const r = currencyExposure({
			funds: [fund(10000, null, "Some Fund EUR Hedged")],
			direct: [],
			totalValue: 10000,
		});
		expect(r.buckets.map((b) => b.key)).toEqual(["unknown"]);
		expect(r.hedged).toEqual([]);
	});
	it("keeps every holder, so the top five plus the tail account for the bucket", () => {
		const r = currencyExposure({
			funds: [
				{ ...fund(1000000, [{ key: "US", weight: 1 }]), id: "a" },
				{ ...fund(10, [{ key: "US", weight: 1 }]), id: "b" },
			],
			direct: [],
			totalValue: 1000010,
		});
		const usd = bucket(r, "USD");
		expect(usd?.contributors.map((c) => c.id)).toEqual(["a", "b"]);
	});
	it("counts a hedge that names no currency as not assignable", () => {
		const r = currencyExposure({
			funds: [
				fund(
					10000,
					[{ key: "US", weight: 1 }],
					"Synthetic World Currency Hedged",
				),
			],
			direct: [],
			totalValue: 10000,
		});
		expect(r.buckets.map((b) => b.key)).toEqual(["unknown"]);
		expect(r.coverage).toBe(0);
	});
	it("puts an offshore-registered company in unknown, not in a peg", () => {
		const r = currencyExposure({
			funds: [fund(10000, [{ key: "BM", weight: 1 }])],
			direct: [],
			totalValue: 10000,
		});
		expect(r.buckets.map((b) => b.key)).toEqual(["unknown"]);
	});
	it("keeps whole-book weights when the equities are only part of the book", () => {
		const r = currencyExposure({
			funds: [fund(50000, [{ key: "US", weight: 1 }])],
			direct: [],
			totalValue: 100000,
		});
		expect(bucket(r, "USD")?.weight).toBeCloseTo(0.5, 6);
		expect(r.coverage).toBe(1);
	});
	it("is the country axis folded into currencies, for any unhedged book (one truth)", () => {
		const COUNTRIES = ["US", "DE", "FR", "JP", "GB", "CH", "BM", "CN", "ZZ"];
		forAll(300, (g) => {
			const vector = () =>
				g.array(0, 6, () => ({
					key: g.pick(COUNTRIES),
					weight: g.double(0, 0.6),
				}));
			const funds = g.array(1, 4, () => ({
				value: g.double(1, 1e6),
				vector: vector(),
			}));
			const direct = g.array(0, 4, () => ({
				value: g.double(1, 1e6),
				country: g.maybe(() => g.pick(COUNTRIES)),
			}));
			const totalValue =
				funds.reduce((s, f) => s + f.value, 0) +
				direct.reduce((s, d) => s + d.value, 0);
			const country = classificationBuckets({
				etfs: funds.map((f) => ({ value: f.value, vector: f.vector })),
				direct: direct.map((d) => ({ value: d.value, key: d.country })),
				totalValue,
			});
			const folded = new Map<string, number>();
			for (const b of country.buckets) {
				const key =
					b.key === "unknown"
						? "unknown"
						: (countryToCurrency(b.key) ?? "unknown");
				folded.set(key, (folded.get(key) ?? 0) + b.value);
			}
			const currency = currencyExposure({
				funds: funds.map((f, i) => ({
					id: `f${i}`,
					label: `Fund ${i}`,
					isin: null,
					value: f.value,
					countryVector: f.vector,
					hedge: null,
				})),
				direct: direct.map((d, i) => ({
					id: `d${i}`,
					label: `Share ${i}`,
					isin: null,
					value: d.value,
					country: d.country,
				})),
				totalValue,
			});
			for (const b of currency.buckets) {
				expect(Math.abs(b.value - (folded.get(b.key) ?? 0))).toBeLessThan(0.01);
			}
			const keys = new Set(currency.buckets.map((b) => b.key));
			for (const [key, value] of folded) {
				if (value >= 0.005) expect(keys.has(key)).toBe(true);
			}
		});
	});
});
