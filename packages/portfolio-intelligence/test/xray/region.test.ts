import { describe, expect, it } from "vitest";
import { COUNTRY_NAME_TO_ISO } from "../../src/internal/xray/country.js";
import {
	countryToRegion,
	XRAY_REGIONS,
} from "../../src/internal/xray/region.js";
describe("canonical region taxonomy", () => {
	it("exposes the 6 canonical regions", () => {
		expect(XRAY_REGIONS).toEqual([
			"northAmerica",
			"europe",
			"asiaPacific",
			"latinAmerica",
			"middleEastAfrica",
			"other",
		]);
	});
	it("maps ISO-3166 alpha-2 codes", () => {
		expect(countryToRegion("US")).toBe("northAmerica");
		expect(countryToRegion("de")).toBe("europe");
		expect(countryToRegion("JP")).toBe("asiaPacific");
		expect(countryToRegion("BR")).toBe("latinAmerica");
		expect(countryToRegion("ZA")).toBe("middleEastAfrica");
	});
	it("unknown / null → other (never fabricated)", () => {
		expect(countryToRegion("XX")).toBe("other");
		expect(countryToRegion(null)).toBe("other");
	});
	it("places additional country codes in their UN-geoscheme region", () => {
		expect(countryToRegion("IS")).toBe("europe");
		expect(countryToRegion("RO")).toBe("europe");
		expect(countryToRegion("KY")).toBe("latinAmerica");
		expect(countryToRegion("BH")).toBe("middleEastAfrica");
		expect(countryToRegion("MO")).toBe("asiaPacific");
		expect(countryToRegion("BM")).toBe("northAmerica");
	});
	it("places the emerging-market top-up codes (EC-2) in their region", () => {
		expect(countryToRegion("VN")).toBe("asiaPacific");
		expect(countryToRegion("AR")).toBe("latinAmerica");
		expect(countryToRegion("NG")).toBe("middleEastAfrica");
		expect(countryToRegion("PK")).toBe("asiaPacific");
		expect(countryToRegion("BD")).toBe("asiaPacific");
	});
});
describe("cross-module coherence: country.ts → region.ts", () => {
	it("every ISO code normalizeCountry can emit resolves to a NAMED region (never silently 'other')", () => {
		const DELIBERATELY_OTHER = new Set<string>([]);
		const emittableIsoCodes = new Set(Object.values(COUNTRY_NAME_TO_ISO));
		const orphaned = [...emittableIsoCodes].filter(
			(iso) => countryToRegion(iso) === "other" && !DELIBERATELY_OTHER.has(iso),
		);
		expect(orphaned).toEqual([]);
	});
});
