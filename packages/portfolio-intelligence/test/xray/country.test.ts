import { describe, expect, it } from "vitest";
import { normalizeCountry } from "../../src/internal/xray/country.js";
describe("normalizeCountry", () => {
	it("maps country display names to ISO 3166-1 alpha-2", () => {
		expect(normalizeCountry("United States")).toBe("US");
		expect(normalizeCountry("United Kingdom")).toBe("GB");
		expect(normalizeCountry("Germany")).toBe("DE");
		expect(normalizeCountry("Japan")).toBe("JP");
		expect(normalizeCountry("South Korea")).toBe("KR");
		expect(normalizeCountry("Taiwan")).toBe("TW");
		expect(normalizeCountry("Czech Republic")).toBe("CZ");
		expect(normalizeCountry("Hong Kong")).toBe("HK");
		expect(normalizeCountry("Cayman Islands")).toBe("KY");
		expect(normalizeCountry("Faroe Islands")).toBe("FO");
		expect(normalizeCountry("Puerto Rico")).toBe("PR");
		expect(normalizeCountry("Macau")).toBe("MO");
		expect(normalizeCountry("United Arab Emirates")).toBe("AE");
	});
	it("maps emerging-market display names to their codes", () => {
		expect(normalizeCountry("Vietnam")).toBe("VN");
		expect(normalizeCountry("Argentina")).toBe("AR");
		expect(normalizeCountry("Nigeria")).toBe("NG");
		expect(normalizeCountry("Pakistan")).toBe("PK");
		expect(normalizeCountry("Bangladesh")).toBe("BD");
	});
	it("is case- and whitespace-insensitive", () => {
		expect(normalizeCountry("  united states  ")).toBe("US");
		expect(normalizeCountry("GERMANY")).toBe("DE");
	});
	it("maps German country display names (German-first imports)", () => {
		expect(normalizeCountry("Deutschland")).toBe("DE");
		expect(normalizeCountry("Frankreich")).toBe("FR");
		expect(normalizeCountry("Schweiz")).toBe("CH");
		expect(normalizeCountry("Vereinigte Staaten")).toBe("US");
		expect(normalizeCountry("Großbritannien")).toBe("GB");
		expect(normalizeCountry("Österreich")).toBe("AT");
		expect(normalizeCountry("Niederlande")).toBe("NL");
		expect(normalizeCountry("Europa")).toBeNull();
	});
	it("passes through an already-ISO alpha-2 code", () => {
		expect(normalizeCountry("us")).toBe("US");
		expect(normalizeCountry("DE")).toBe("DE");
	});
	it("passes a 2-letter token through unchanged even when it is not a known country", () => {
		expect(normalizeCountry("zz")).toBe("ZZ");
	});
	it("maps a literal 'Other' residue row to null", () => {
		expect(normalizeCountry("Other")).toBeNull();
	});
	it("returns null for unknown/empty input, never a coalesced string", () => {
		expect(normalizeCountry("")).toBeNull();
		expect(normalizeCountry("Frontier Quantum Memeland")).toBeNull();
		expect(normalizeCountry(null)).toBeNull();
		expect(normalizeCountry(undefined)).toBeNull();
	});
});
