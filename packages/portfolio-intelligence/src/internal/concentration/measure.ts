/**
 * Issuer concentration as figures, without a cap verdict. The index and the
 * effective number of issuers are measured over the issuers that could be
 * attributed; below full coverage the index is a lower bound and the
 * effective number an upper bound.
 */
import type { Bounded, Concentration } from "../../types.js";
import { topTenBookConcentration } from "../xray/top-ten.js";
import type { MergedPosition } from "../xray/types.js";
import { isBookSeenThrough } from "./leg-a.js";
import { evaluateIssuerConcentration } from "./from-lookthrough.js";

/** The cap is required by the engine but plays no part in the figures reported here. */
export const NEUTRAL_CAP_PCT = 10;

export function measureConcentration(
	classified: readonly MergedPosition[],
): Concentration {
	const result = evaluateIssuerConcentration({
		rows: classified,
		capPct: NEUTRAL_CAP_PCT,
	});
	const complete = result.unattributed === 0;
	// The policy verdict can withhold its cap assessment at low coverage.
	// Descriptive analysis can still report the largest identified issuer.
	const largest = result.issuers[0];
	const base = {
		attributedCoverage: result.coverage,
		topTenWeight: topTenBookConcentration(classified),
		largestIssuer: largest
			? {
					key: largest.issuerId,
					name: largest.issuerName,
					weight: largest.weight,
				}
			: null,
	};
	if (!isBookSeenThrough(result))
		return {
			status: "refused",
			refusal: result.refusal ?? "coverage_below_floor",
			...base,
			hhi: null,
			effectiveIssuers: null,
		};
	const hhi: Bounded = {
		value: result.hhi,
		bound: complete ? "exact" : "lower",
	};
	const effectiveIssuers: Bounded | null =
		result.effectiveN === null
			? null
			: { value: result.effectiveN, bound: complete ? "exact" : "upper" };
	return { status: "available", refusal: null, ...base, hhi, effectiveIssuers };
}
