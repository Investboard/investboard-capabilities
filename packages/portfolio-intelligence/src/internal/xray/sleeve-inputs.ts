/** Joining fund inputs with their dissolution results for coverage and sleeves. */
import type { CoverageEtfInput } from "./coverage.js";
import { fundAssetClass } from "./dissolve.js";
import type { OpaqueSleeveInput } from "./opaque-sleeves.js";
import type { EngineEtfInput, EtfDissolution } from "./types.js";
const underlyingClassOf = fundAssetClass;
export function joinSleeves(
	etfInputs: readonly EngineEtfInput[],
	dissolutions: readonly EtfDissolution[],
): {
	coverage: CoverageEtfInput[];
	opaque: OpaqueSleeveInput[];
} {
	const coverage: CoverageEtfInput[] = [];
	const opaque: OpaqueSleeveInput[] = [];
	for (let i = 0; i < etfInputs.length; i++) {
		const etf = etfInputs[i];
		const d = dissolutions[i];
		if (!etf || !d) continue;
		const klass = underlyingClassOf(etf);
		coverage.push({
			value: etf.value,
			coveredWeight: d.coveredWeight,
			degraded: d.degraded,
			hasEquityConstituents: klass === "equities" && d.coveredWeight > 0,
		});
		opaque.push({
			ticker: etf.ticker,
			name: etf.name,
			value: etf.value,
			coveredWeight: d.coveredWeight,
			degraded: d.degraded,
			assetClass: klass,
		});
	}
	return { coverage, opaque };
}
