/** Funds, or parts of funds, that are not looked through, with the reason. */
import type {
	XRayOpaqueSleeve,
	XRayOpaqueSleeveReasonKey,
} from "../contracts.js";
export interface OpaqueSleeveInput {
	ticker: string;
	name: string;
	value: number;
	coveredWeight: number;
	degraded: boolean;
	assetClass: string;
}
const RESIDUAL_WEIGHT_FLOOR = 1e-6;
function inherentReasonKey(assetClass: string): XRayOpaqueSleeveReasonKey {
	switch (assetClass) {
		case "cash":
			return "money-market";
		case "bonds":
			return "bond-fund";
		default:
			return "held-whole";
	}
}
export function deriveOpaqueSleeves(
	sleeves: OpaqueSleeveInput[],
	bookValue: number,
): XRayOpaqueSleeve[] {
	if (!Number.isFinite(bookValue) || bookValue <= 0) return [];
	const out: XRayOpaqueSleeve[] = [];
	for (const s of sleeves) {
		const uncovered = 1 - Math.max(0, Math.min(1, s.coveredWeight));
		if (uncovered < RESIDUAL_WEIGHT_FLOOR) continue;
		const reasonKey: XRayOpaqueSleeveReasonKey = s.degraded
			? "pending"
			: inherentReasonKey(s.assetClass);
		out.push({
			ticker: s.ticker,
			name: s.name,
			weight: (s.value * uncovered) / bookValue,
			kind: s.degraded ? "pending" : "inherent",
			reasonKey,
			reason: reasonKey,
			assetClass: s.assetClass,
		});
	}
	return out;
}
