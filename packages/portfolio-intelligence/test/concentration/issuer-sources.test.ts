import { describe, expect, it } from "vitest";
import {
	evaluateIssuerConcentration,
	type LookThroughRowLike,
} from "../../src/internal/concentration/from-lookthrough.js";
function row(
	id: string,
	isin: string | null,
	value: number,
	provenance?: LookThroughRowLike["provenance"],
): LookThroughRowLike {
	return {
		id,
		isin,
		value,
		name: "Alphanumeric",
		assetClass: "equities",
		provenance,
	};
}
describe("issuer source attribution", () => {
	it("combines share classes using source amounts and retains the equity denominator", () => {
		const result = evaluateIssuerConcentration({
			capPct: 10,
			rows: [
				row("a", "US2222223059", 60, {
					directValue: 30,
					viaFunds: [{ etf: "WORLD", name: "World fund", value: 30 }],
				}),
				row("b", "US2222221079", 40, {
					directValue: 0,
					viaFunds: [{ etf: "WORLD", name: "World fund", value: 40 }],
				}),
				row("residual:OTHER", null, 100),
				{ ...row("bond", null, 500), assetClass: "bonds" },
			],
		});
		expect(result.issuers).toHaveLength(1);
		const issuer = result.issuers[0]!;
		expect(issuer.weight).toBe(0.5);
		expect(issuer.sources?.directWeight).toBe(0.15);
		expect(issuer.sources?.viaFunds).toEqual([
			{ id: "WORLD", name: "World fund", weight: 0.35 },
		]);
		expect(issuer.sources?.unassignedWeight).toBeCloseTo(0);
		const sources = issuer.sources!;
		for (const w of [
			sources.directWeight,
			sources.unassignedWeight,
			...sources.viaFunds.map((f) => f.weight),
		])
			expect(w >= 0 && w <= 1).toBe(true);
	});
	it("keeps missing legacy source data unassigned and never changes the issuer weight", () => {
		const result = evaluateIssuerConcentration({
			capPct: 10,
			rows: [
				row("a", "US2222223059", 60, {
					directValue: 30,
					viaFunds: [{ etf: "WORLD", value: 30 }],
				}),
				row("b", "US2222221079", 40),
			],
			unlistedValueByClass: { equities: 100 },
		});
		expect(result.issuers[0]?.weight).toBe(0.5);
		expect(result.issuers[0]?.sources?.unassignedWeight).toBeCloseTo(0.2);
	});
	it("retains the canonical fund identity across different listing labels", () => {
		const result = evaluateIssuerConcentration({
			capPct: 10,
			rows: [
				row("a", "US2222223059", 60, {
					directValue: 0,
					viaFunds: [
						{ id: "isin:IESYN4303130", etf: "CORE", name: "World", value: 60 },
					],
				}),
				row("b", "US2222221079", 40, {
					directValue: 0,
					viaFunds: [
						{ id: "isin:IESYN4303130", etf: "IWDA", name: "World", value: 40 },
					],
				}),
			],
		});
		expect(result.issuers[0]?.sources?.viaFunds).toEqual([
			{ id: "isin:IESYN4303130", name: "World", weight: 1 },
		]);
	});
	it("refuses inconsistent source amounts instead of scaling missing money into a fund", () => {
		const result = evaluateIssuerConcentration({
			capPct: 10,
			rows: [
				row("a", "US2222223059", 100, {
					directValue: 10,
					viaFunds: [{ etf: "WORLD", value: 20 }],
				}),
			],
		});
		expect(result.issuers[0]?.sources).toEqual({
			directWeight: 0,
			viaFunds: [],
			unassignedWeight: 1,
		});
	});
});
