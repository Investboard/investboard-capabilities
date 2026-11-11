import { forAll, type Gen } from "../support/property.js";
import { describe, expect, it } from "vitest";
import { dissolveEtfs } from "../../src/internal/xray/dissolve.js";
import { mergeByIdentity } from "../../src/internal/xray/merge.js";
import type { EngineEtfInput } from "../../src/internal/xray/types.js";
function etf(g: Gen): EngineEtfInput {
	return {
		ticker: `${g.string(3, 5).toUpperCase()}.DE`,
		isin: null,
		name: g.string(1, 30),
		value: g.double(100, 1000000),
		underlyingAssetClass: g.pick(["equities", "bonds", null]),
		asOf: null,
		constituents: g.array(0, 25, () => ({
			identifier: g.pick(["AAA", "BBB", "CCC", "DDD"]),
			isin: g.maybe(() =>
				g.pick(["US0000000001", "US0000000002", "US0000000003"]),
			),
			name: g.string(1, 20),
			weight: g.double(0.0001, 0.2),
		})),
	};
}
function capToUnitSum(etfs: EngineEtfInput[]): EngineEtfInput[] {
	return etfs.map((e) => {
		const sum = e.constituents.reduce((s, c) => s + c.weight, 0);
		return sum <= 1
			? e
			: {
					...e,
					constituents: e.constituents.map((c) => ({
						...c,
						weight: c.weight / sum,
					})),
				};
	});
}
describe("merge value conservation (property)", () => {
	it("Σ merged value ≈ Σ input value: residuals close the gap across the WHOLE coverage band", () => {
		forAll(200, (g) => {
			const etfs = g.array(1, 5, () => etf(g));
			const capped = capToUnitSum(etfs);
			const inputTotal = capped.reduce((s, e) => s + e.value, 0);
			const { exposures } = dissolveEtfs(capped);
			const merged = mergeByIdentity([], exposures, inputTotal);
			const mergedTotal = merged.reduce((s, p) => s + p.value, 0);
			expect(Math.abs(mergedTotal - inputTotal)).toBeLessThan(
				0.011 * Math.max(1, merged.length),
			);
		});
	});
	it("provenance parts ≈ whole: direct + Σ viaFunds.weight matches weight within rounding drift", () => {
		forAll(200, (g) => {
			const etfs = g.array(1, 5, () => etf(g));
			const capped = capToUnitSum(etfs);
			const inputTotal = capped.reduce((s, e) => s + e.value, 0);
			const { exposures } = dissolveEtfs(capped);
			const merged = mergeByIdentity([], exposures, inputTotal);
			for (const p of merged) {
				const parts =
					p.provenance.direct +
					p.provenance.viaFunds.reduce((s, v) => s + v.weight, 0);
				expect(Math.abs(p.weight - parts)).toBeLessThanOrEqual(
					1e-4 * (1 + p.provenance.viaFunds.length),
				);
			}
		});
	});
});
