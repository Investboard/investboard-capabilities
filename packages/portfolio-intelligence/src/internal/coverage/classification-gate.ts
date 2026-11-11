/**
 * A portfolio whose equity is mostly unnamed is marked degraded: its sector,
 * country and issuer figures would describe only a small part of it.
 */
import type { SecurityProfile } from "../../types.js";
import type { MergedPosition } from "../xray/types.js";

/** Below this share of equities in the portfolio the check does not apply. */
export const GATE_MIN_EQUITY_WEIGHT = 0.2;
/** Below this share of classifiable equity with a sector, the portfolio is degraded. */
export const GATE_NAMED_RATIO_FLOOR = 0.5;

export function classificationGate(
	classified: readonly MergedPosition[],
	valuedTotal: number,
	profiles: ReadonlyMap<string, SecurityProfile>,
): { degraded: boolean; reason: string | null } {
	let classifiable = 0;
	let named = 0;
	// The named share is counted within the same base it is divided by: equity
	// with an ISIN whose profile is not a fund's own. A position outside that
	// base (no ISIN, or a fund's own profile that still carried a sector for a
	// look-through constituent) can neither lower nor raise the ratio.
	for (const p of classified) {
		if (p.assetClass !== "equities" || p.isin === null) continue;
		if (profiles.get(p.isin)?.assetClass === null) continue;
		classifiable += p.value;
		if (p.sektor !== null) named += p.value;
	}
	const share = (value: number) => (valuedTotal > 0 ? value / valuedTotal : 0);
	const classifiableWeight = share(classifiable);
	const namedWeight = share(named);
	if (classifiableWeight < GATE_MIN_EQUITY_WEIGHT)
		return { degraded: false, reason: null };
	const ratio = classifiableWeight > 0 ? namedWeight / classifiableWeight : 1;
	return ratio < GATE_NAMED_RATIO_FLOOR
		? { degraded: true, reason: "classification_degraded" }
		: { degraded: false, reason: null };
}
