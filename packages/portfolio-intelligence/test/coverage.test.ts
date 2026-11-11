import { describe, expect, it } from "vitest";
import { measureConcentration } from "../src/internal/concentration/measure.js";
import { classificationGate } from "../src/internal/coverage/classification-gate.js";
import {
	classifyPositions,
	measureCoverage,
} from "../src/internal/coverage/exposure-block.js";
import { profileMap } from "../src/internal/resolve/security-profile.js";
import { dissolveEtfs } from "../src/internal/xray/dissolve.js";
import type {
	EngineEtfInput,
	MergedPosition,
} from "../src/internal/xray/types.js";

function position(
	overrides: Partial<MergedPosition> & Pick<MergedPosition, "id" | "value">,
): MergedPosition {
	return {
		isin: null,
		ticker: null,
		name: overrides.id,
		weight: overrides.value / 100,
		assetClass: "equities",
		sektor: null,
		region: null,
		provenance: { direct: overrides.value / 100, viaFunds: [] },
		...overrides,
	};
}

describe("measureConcentration", () => {
	it("labels hhi as a lower bound below full coverage", () => {
		const result = measureConcentration([
			position({
				id: "isin:US1111110005",
				isin: "US1111110005",
				name: "Alder Inc.",
				value: 50,
			}),
			position({
				id: "isin:DESYN0000010",
				isin: "DESYN0000010",
				name: "Maple SE",
				value: 40,
			}),
			position({
				id: "residual:WRLD",
				name: "Synthetic World Fund",
				value: 10,
				provenance: { direct: 0, viaFunds: [] },
			}),
		]);
		expect(result.status).toBe("available");
		expect(result.attributedCoverage).toBeCloseTo(0.9, 10);
		expect(result.hhi?.value).toBeCloseTo(0.41, 10);
		expect(result.hhi?.bound).toBe("lower");
		expect(result.effectiveIssuers?.value).toBeCloseTo(1 / 0.41, 10);
		expect(result.effectiveIssuers?.bound).toBe("upper");
		expect(result.largestIssuer).toMatchObject({
			name: "Alder Inc.",
			weight: 0.5,
		});
		expect(result.topTenWeight).toBeCloseTo(0.9, 10);
	});

	it("labels them exact at full coverage", () => {
		const result = measureConcentration([
			position({
				id: "isin:US1111110005",
				isin: "US1111110005",
				name: "Alder Inc.",
				value: 60,
			}),
			position({
				id: "isin:DESYN0000010",
				isin: "DESYN0000010",
				name: "Maple SE",
				value: 40,
			}),
		]);
		expect(result.hhi).toEqual({ value: 0.52, bound: "exact" });
		expect(result.effectiveIssuers?.bound).toBe("exact");
	});

	it("refuses below the coverage floor and gives no index", () => {
		const result = measureConcentration([
			position({
				id: "isin:US1111110005",
				isin: "US1111110005",
				name: "Alder Inc.",
				value: 5,
			}),
			position({
				id: "residual:WRLD",
				name: "Synthetic World Fund",
				value: 95,
				provenance: { direct: 0, viaFunds: [] },
			}),
		]);
		expect(result.status).toBe("refused");
		expect(result.refusal).toBe("coverage_below_floor");
		expect(result.hhi).toBeNull();
		expect(result.effectiveIssuers).toBeNull();
	});

	it("never withholds a single issuer measured above 10% of the equity book", () => {
		const result = measureConcentration([
			position({
				id: "isin:US1111110005",
				isin: "US1111110005",
				name: "Alder Inc.",
				value: 30,
			}),
			position({
				id: "residual:WRLD",
				name: "Synthetic World Fund",
				value: 70,
				provenance: { direct: 0, viaFunds: [] },
			}),
		]);
		expect(result.status).toBe("available");
		expect(result.hhi?.bound).toBe("lower");
	});
});

function fund(overrides: Partial<EngineEtfInput>): EngineEtfInput {
	return {
		ticker: "F",
		isin: null,
		name: "Fund",
		value: 100,
		underlyingAssetClass: "equities",
		constituents: [],
		sectorVector: null,
		countryVector: null,
		asOf: null,
		...overrides,
	};
}

describe("measureCoverage", () => {
	it("separates looked-through, held-whole and pending value", () => {
		const etfs = [
			fund({
				ticker: "SEEN",
				value: 50,
				constituents: [
					{ identifier: "A", isin: "US1111110005", name: "A", weight: 1 },
				],
			}),
			fund({ ticker: "BOND", value: 30, underlyingAssetClass: "bonds" }),
			fund({ ticker: "GAP", value: 20, degraded: true }),
		];
		const { dissolutions } = dissolveEtfs(etfs);
		const { coverage, sleeves } = measureCoverage(etfs, dissolutions, 100);
		expect(coverage.opaqueInherent).toBeCloseTo(0.3, 10);
		expect(coverage.opaquePending).toBeCloseTo(0.2, 10);
		expect(coverage.transparent).toBeCloseTo(0.5, 10);
		expect(sleeves.map((s) => [s.ticker, s.kind])).toEqual(
			expect.arrayContaining([
				["BOND", "inherent"],
				["GAP", "pending"],
			]),
		);
	});
});

describe("classifyPositions", () => {
	const profiles = profileMap([
		{
			isin: "US1111110005",
			name: "Alder Inc.",
			sector: "Technology",
			country: "United States",
			assetClass: "equities",
		},
		{
			isin: "IESYN0000020",
			name: "Synthetic World Fund",
			sector: "Financial Services",
			country: "Ireland",
			assetClass: null,
		},
	]);

	it("classifies a fund constituent from its profile and names it after the profile", () => {
		const [out] = classifyPositions(
			[
				position({
					id: "isin:US1111110005",
					isin: "US1111110005",
					name: "ALDR",
					value: 40,
					provenance: {
						direct: 0,
						viaFunds: [{ etf: "WRLD", weight: 0.4, shareInEtf: 0.4 }],
					},
				}),
			],
			profiles,
		);
		expect(out?.sektor).toBe("technology");
		expect(out?.region).toBe("northAmerica");
		expect(out?.name).toBe("Alder Inc.");
		expect(out?.issuerIdentity).toEqual({
			verifiedName: "Alder Inc.",
			receipt: false,
			source: "caller",
		});
	});

	it("never classifies a direct holding from a fund's own profile", () => {
		const [out] = classifyPositions(
			[
				position({
					id: "isin:IESYN0000020",
					isin: "IESYN0000020",
					name: "Synthetic World Fund",
					value: 10,
				}),
			],
			profiles,
		);
		expect(out?.sektor).toBeNull();
	});
});

describe("classificationGate", () => {
	it("degrades a book whose equity is mostly unnamed", () => {
		const gate = classificationGate(
			[
				position({
					id: "isin:US1111110005",
					isin: "US1111110005",
					value: 30,
					sektor: "technology",
				}),
				position({ id: "isin:US2222220002", isin: "US2222220002", value: 70 }),
			],
			100,
			profileMap([]),
		);
		expect(gate).toEqual({ degraded: true, reason: "classification_degraded" });
	});

	it("passes a book whose equity is mostly named", () => {
		const gate = classificationGate(
			[
				position({
					id: "isin:US1111110005",
					isin: "US1111110005",
					value: 70,
					sektor: "technology",
				}),
				position({ id: "isin:US2222220002", isin: "US2222220002", value: 30 }),
			],
			100,
			profileMap([]),
		);
		expect(gate).toEqual({ degraded: false, reason: null });
	});
});
