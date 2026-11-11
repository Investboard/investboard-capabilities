import { describe, expect, it } from "vitest";
import { evaluateIssuerConcentration } from "../../src/internal/concentration/from-lookthrough.js";
import { canonicalIssuerIdentities } from "../../src/internal/xray/issuer-identities.js";
const row = (isin: string, name: string, value: number) => ({
	id: `isin:${isin}`,
	isin,
	name,
	value,
	assetClass: "equities",
});
describe("exact security identity across issuer naming", () => {
	it("joins non-US aliases before grading the cap and exposes trade aliases", () => {
		const rows = [
			row("DESYN3691660", "MAPLE SE", 90),
			row(" desyn3691660 ", "MAPLE.DE", 90),
			...Array.from({ length: 41 }, (_, i) =>
				row(`OTHER${i}`, `Other ${i}`, 20),
			),
		];
		const result = evaluateIssuerConcentration({ rows, capPct: 10 });
		expect(result.maxIssuer?.weight).toBeCloseTo(0.18);
		expect(result.breached).toBe(true);
		expect(result.issuerAliases).toEqual({
			"issuer-name:maplede": "issuer-name:maple",
		});
		expect(
			evaluateIssuerConcentration({ rows: [...rows].reverse(), capPct: 10 })
				.maxIssuer,
		).toMatchObject({ issuerId: result.maxIssuer?.issuerId, weight: 0.18 });
	});
	it("keeps US share classes and legitimate cross-security name grouping", () => {
		const rows = [
			row("US2222223059", "ALPN", 20),
			row("US2222221079", "ALPC", 30),
			row("DESYN1804330", "Oakfield SE", 20),
			row("DESYN5998700", "Oakfield SE 1.5% 2030", 30),
		];
		const { keys } = canonicalIssuerIdentities(rows);
		expect(keys).toEqual([
			"cusip6:222222",
			"cusip6:222222",
			"issuer-name:oakfield",
			"issuer-name:oakfield",
		]);
	});
	it("does not connect residual funds or unrelated security identities", () => {
		const rows = [
			row("DESYN3691660", "MAPLE", 10),
			row("DESYN1804330", "Oakfield", 20),
			{ ...row("DESYN3691660", "Fund", 70), id: "residual:FUND" },
		];
		expect(canonicalIssuerIdentities(rows).keys).toEqual([
			"issuer-name:maple",
			"issuer-name:oakfield",
			"residual:FUND",
		]);
	});
});
it.each([
	"N/A",
	"UNKNOWN",
	"",
	"USNOTANISINX",
])("does not unify unrelated issuers using placeholder ISIN %s", (isin) => {
	const rows = [row(isin, "MAPLE SE", 100), row(isin, "Oakfield SE", 100)];
	expect(canonicalIssuerIdentities(rows).keys).toEqual([
		"issuer-name:maple",
		"issuer-name:oakfield",
	]);
});
