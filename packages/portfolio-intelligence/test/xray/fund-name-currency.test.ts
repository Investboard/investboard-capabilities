import { describe, expect, it } from "vitest";
import { holdingsCurrencyOfFundName } from "../../src/internal/xray/fund-name-currency.js";
describe("holdingsCurrencyOfFundName", () => {
	it.each([
		["Synthetic $ Treasury Bond 7-10yr UCITS ETF USD (Acc)", "USD"],
		["Synthetic Core Global Aggregate Bond UCITS ETF USD (Acc)", null],
		["Synthetic Core € Govt Bond UCITS ETF", "EUR"],
		["Synthetic II EUR Overnight Rate Swap UCITS ETF", "EUR"],
		["Synthetic J.P. Morgan $ EM Bond UCITS ETF", "USD"],
		["Synthetic 7-10 Year Treasury Bond ETF", null],
		["Synthetic $ Corp Bond UCITS ETF EUR (Dist)", "USD"],
		["Synthetic EUR Corporate Bond UCITS ETF (EUR) Distributing", "EUR"],
		["Synthetic II EUR Overnight Rate Swap UCITS ETF 1C", "EUR"],
		["Synthetic € Govt Bond 1-3yr UCITS ETF EUR (Dist)", "EUR"],
		["Euro Short Term Bond Fund EUR (Dist)", "EUR"],
		["Global Short Term Bond Fund USD Acc", null],
		["Synthetic Prime Euro Govies UCITS ETF DR (D)", "EUR"],
		["Synthetic Core UK Gilts UCITS ETF GBP (Dist)", "GBP"],
		["Sterling Corporate Bond Fund", "GBP"],
		["£ Ultrashort Bond UCITS ETF", "GBP"],
		["Synthetic US Dollar Short Duration Corporate Bond UCITS ETF", "USD"],
		["Synthetic US$ Treasury 10+Y UCITS ETF", "USD"],
		["Japan Government Bond Yen Fund", "JPY"],
		["¥ Money Market Fund", "JPY"],
		["UBS Swiss Franc Bond Fund", "CHF"],
		["CHF Money Market Fund", "CHF"],
		["Synthetic II Eurozone Government Bond UCITS ETF 1C", null],
		["European High Yield Bond UCITS ETF", null],
		["Europe Government Bond Fund", null],
		["Global Bond Fund USD and EUR", null],
		["$ and € Liquidity Fund", null],
		["Synthetic Bloomberg 1-3 Month T-Bill UCITS ETF", null],
		["Synthetic US Treasury Bond 7-10 Year UCITS ETF Dist", null],
	])("reads %s as %s", (name, currency) => {
		expect(holdingsCurrencyOfFundName(name)).toBe(currency);
	});
	it("reads nothing from no name", () => {
		expect(holdingsCurrencyOfFundName(null)).toBeNull();
		expect(holdingsCurrencyOfFundName(undefined)).toBeNull();
		expect(holdingsCurrencyOfFundName("")).toBeNull();
	});
	it("cuts at the last wrapper word, never the first: a currency between two wrappers is read", () => {
		expect(
			holdingsCurrencyOfFundName(
				"UBS ETF (LU) Bloomberg USD Treasury UCITS ETF",
			),
		).toBe("USD");
		expect(
			holdingsCurrencyOfFundName(
				"UBS ETF (IE) Bloomberg EUR Treasury 1-10 UCITS ETF (EUR) A-dis",
			),
		).toBe("EUR");
	});
	it("reads nothing before a name's leading wrapper word: a brand that starts with ETF stays unknown", () => {
		expect(holdingsCurrencyOfFundName("ETF Euro Cash")).toBeNull();
	});
	it("reads the name before the last wrapper word, so a broker name's early ETF leaves the rest unread", () => {
		expect(
			holdingsCurrencyOfFundName(
				"UBS ETF (LU) Bloomberg TIPS 1-10 UCITS ETF (USD) A-dis",
			),
		).toBeNull();
	});
});
