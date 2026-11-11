import { describe, expect, it } from "vitest";
import {
	issuerKeyForIsin,
	issuerKeyForPosition,
	normalizeIssuerName,
} from "../../src/internal/xray/issuer.js";
describe("issuerKeyForIsin", () => {
	it("extracts CUSIP-6 (chars 3..8) from a US ISIN", () => {
		expect(issuerKeyForIsin("US2222223059")).toBe("cusip6:222222");
		expect(issuerKeyForIsin("US2222221079")).toBe("cusip6:222222");
	});
	it("normalizes case and whitespace before extracting", () => {
		expect(issuerKeyForIsin(" us2222223059 ")).toBe("cusip6:222222");
	});
	it("returns null for a non-US ISIN (no grouping until A2.2)", () => {
		expect(issuerKeyForIsin("IESYN4303130")).toBeNull();
		expect(issuerKeyForIsin("DESYN3691660")).toBeNull();
	});
	it("returns null for a malformed or short ISIN", () => {
		expect(issuerKeyForIsin("US123")).toBeNull();
		expect(issuerKeyForIsin("")).toBeNull();
		expect(issuerKeyForIsin(null)).toBeNull();
	});
});
describe("normalizeIssuerName", () => {
	it("collapses a legal-form suffix so 'MAPLE SE' and 'MAPLE' normalize equal", () => {
		expect(normalizeIssuerName("MAPLE SE")).toBe(normalizeIssuerName("MAPLE"));
		expect(normalizeIssuerName("MAPLE SE")).toBe("maple");
	});
	it("folds diacritics and case", () => {
		expect(normalizeIssuerName("Pinécrest")).toBe("pinecrest");
		expect(normalizeIssuerName("MÜNCHENER RÜCK")).toBe(
			normalizeIssuerName("Münchener Rück"),
		);
	});
	it("strips bond descriptors so an Oakfield bond normalizes equal to the equity", () => {
		expect(normalizeIssuerName("Oakfield SE 1.5% 2030")).toBe(
			normalizeIssuerName("Oakfield SE"),
		);
		expect(normalizeIssuerName("Oakfield SE 1.5% 2030")).toBe("oakfield");
	});
	it.each([
		["Oakfield SE 1.5% 2030", "bare space-separated year"],
		["OAKFIELD SE 1.5% 15-SEP-2030", "hyphenated day-month-year"],
		["OAKFIELD SE 1.5 15/09/2030", "slashed date, coupon without a percent"],
		["Oakfield SE 1.5% 15.09.2030", "dotted date"],
		["OAKFIELD SE 1.5% SEP2030", "month-year, no day"],
		["Oakfield SE 1.5% 20300915", "all-digit ISO-ish date"],
	])("collapses an Oakfield bond onto the Oakfield equity: %s (%s)", (bondName) => {
		expect(normalizeIssuerName(bondName)).toBe(
			normalizeIssuerName("Oakfield SE"),
		);
		expect(normalizeIssuerName(bondName)).toBe("oakfield");
	});
	it("keeps a bare integer, which can be the issuer rather than a coupon", () => {
		expect(normalizeIssuerName("3M Co")).toBe("3m");
	});
	it("strips FRN / float / callable bond markers", () => {
		expect(normalizeIssuerName("Willowmotor AG FRN 2028")).toBe("willowmotor");
		expect(normalizeIssuerName("Willowmotor AG Float 2028")).toBe(
			"willowmotor",
		);
	});
	it("does NOT collapse two genuinely different issuers", () => {
		expect(normalizeIssuerName("MAPLE SE")).not.toBe(
			normalizeIssuerName("Rowan AG"),
		);
		expect(normalizeIssuerName("Oakfield SE")).not.toBe(
			normalizeIssuerName("Munich Re"),
		);
	});
	it("returns null when nothing meaningful remains after stripping", () => {
		expect(normalizeIssuerName("SE")).toBeNull();
		expect(normalizeIssuerName("The Group")).toBeNull();
		expect(normalizeIssuerName("   ")).toBeNull();
		expect(normalizeIssuerName("")).toBeNull();
		expect(normalizeIssuerName(null)).toBeNull();
	});
});
describe("issuerKeyForPosition", () => {
	it("keeps the US CUSIP-6 path (ISIN wins over name)", () => {
		expect(
			issuerKeyForPosition({ isin: "US2222223059", name: "Alphanumeric Inc." }),
		).toBe("cusip6:222222");
	});
	it("keys a non-US line on its normalized issuer name", () => {
		expect(
			issuerKeyForPosition({ isin: "DESYN3691660", name: "MAPLE SE" }),
		).toBe("issuer-name:maple");
	});
	it("groups two non-US lines of the same issuer under one key", () => {
		const equity = issuerKeyForPosition({
			isin: "DESYN3691660",
			name: "MAPLE SE",
		});
		const bond = issuerKeyForPosition({
			isin: "XS1234567890",
			name: "MAPLE SE 1.0% 2029",
		});
		expect(equity).toBe(bond);
		expect(equity).toBe("issuer-name:maple");
	});
	it("returns null when neither a US CUSIP-6 nor a normalizable name exists", () => {
		expect(
			issuerKeyForPosition({ isin: "DESYN3691660", name: "SE" }),
		).toBeNull();
		expect(issuerKeyForPosition({ isin: null, name: null })).toBeNull();
		expect(issuerKeyForPosition({ isin: "IESYN4303130", name: "" })).toBeNull();
	});
});
