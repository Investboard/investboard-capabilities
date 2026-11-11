import { describe, expect, it } from "vitest";
import { toConcentrationPosition } from "../../src/internal/concentration/from-lookthrough.js";
import { buildIssuerVector } from "../../src/internal/concentration/issuer-vector.js";
import { groupByIssuer } from "../../src/internal/xray/group-by-issuer.js";
import { issuerKeyForPosition } from "../../src/internal/xray/issuer.js";
import type { MergedPosition } from "../../src/internal/xray/types.js";
function pos(over: Partial<MergedPosition>): MergedPosition {
	return {
		id: "isin:US1111111005",
		isin: "US1111111005",
		ticker: "ALDR",
		name: "Alder Inc.",
		value: 1000,
		weight: 0.1,
		assetClass: "equities",
		sektor: null,
		region: null,
		provenance: { direct: 0.1, viaFunds: [] },
		...over,
	};
}
function resolvedKey(p: MergedPosition): string {
	return issuerKeyForPosition({ isin: p.isin, name: p.name }) ?? p.id;
}
describe("issuer-key parity (display == verdict)", () => {
	const positions = [
		pos({
			id: "isin:DESYN3691660",
			isin: "DESYN3691660",
			ticker: "MAPLE",
			name: "MAPLE SE",
			value: 2000,
			weight: 0.02,
		}),
		pos({
			id: "isin:XS1234567890",
			isin: "XS1234567890",
			ticker: null,
			name: "MAPLE SE 1.0% 2029",
			value: 1000,
			weight: 0.01,
			assetClass: "bonds",
		}),
		pos({
			id: "isin:US2222223059",
			isin: "US2222223059",
			ticker: "ALPN",
			name: "Alphanumeric Inc. Class A",
			value: 1500,
			weight: 0.015,
		}),
	];
	it("groupByIssuer keys equal the keys the concentration vector aggregates on", () => {
		const displayKeys = new Set(groupByIssuer(positions).map((g) => g.key));
		const verdictKeys = new Set(positions.map(resolvedKey));
		expect([...displayKeys].sort()).toEqual([...verdictKeys].sort());
	});
	it("a grouped non-US issuer collapses to one line in the display", () => {
		const groups = groupByIssuer(positions);
		const mapleGroup = groups.find((g) => g.key === "issuer-name:maple");
		expect(mapleGroup?.grouped).toBe(true);
	});
	it("the single-issuer VERDICT counts MAPLE's equity only, not its bond", () => {
		const { issuers } = buildIssuerVector(
			positions.map(toConcentrationPosition),
		);
		const mapleIssuer = issuers.find((i) => i.issuerId === "issuer-name:maple");
		expect(mapleIssuer).toBeDefined();
		expect(mapleIssuer?.weight).toBeCloseTo(2000 / 3500, 6);
	});
});
