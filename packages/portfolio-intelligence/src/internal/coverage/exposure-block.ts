/** Classifying merged positions from security profiles, and measuring how much of the portfolio is seen through. */
import type { SecurityProfile } from "../../types.js";
import type { XRayOpaqueSleeve } from "../contracts.js";
import { profileOf } from "../resolve/security-profile.js";
import {
	classifyExposures,
	type ExposureProfile,
} from "../xray/classify-exposures.js";
import { type BookCoverage, computeBookCoverage } from "../xray/coverage.js";
import { isResidualId } from "../xray/identity.js";
import { deriveOpaqueSleeves } from "../xray/opaque-sleeves.js";
import { hasDepositaryReceiptMarker } from "../xray/receipt-markers.js";
import { joinSleeves } from "../xray/sleeve-inputs.js";
import type {
	EngineEtfInput,
	EtfDissolution,
	IssuerIdentityLike,
	MergedPosition,
} from "../xray/types.js";

/** A constituent name that is only a ticker symbol. */
export function looksLikeBareTicker(name: string): boolean {
	return /^[A-Z0-9-]{1,8}(\.[A-Z]{1,4})?$/.test(name.trim());
}

function identityOf(
	position: MergedPosition,
	profiles: ReadonlyMap<string, SecurityProfile>,
): IssuerIdentityLike {
	const profile = position.isin ? profiles.get(position.isin) : undefined;
	const verifiedName = profile?.name ? profile.name : null;
	const receipt =
		hasDepositaryReceiptMarker(position.name, position.ticker) ||
		hasDepositaryReceiptMarker(verifiedName, null);
	if (verifiedName) return { verifiedName, receipt, source: "caller" };
	return { verifiedName: null, receipt, source: receipt ? "row_name" : "none" };
}

/**
 * Sector and region for each position from its profile, the profile's name
 * for a fund constituent known only by its ticker, and the issuer identity.
 */
export function classifyPositions(
	merged: readonly MergedPosition[],
	profiles: ReadonlyMap<string, SecurityProfile>,
): MergedPosition[] {
	const byIsin = new Map<string | null, ExposureProfile | null>(
		merged.map((p): [string | null, ExposureProfile | null] => [
			p.isin,
			profileOf(
				{
					isin: p.isin,
					assetClass: p.assetClass,
					heldDirectly: p.provenance.direct > 0,
				},
				profiles,
			),
		]),
	);
	const classified = classifyExposures(
		[...merged],
		(isin) => byIsin.get(isin) ?? null,
		merged.length,
	);
	for (const p of classified) {
		if (p.isin === null || p.provenance.direct > 0) continue;
		const name = profiles.get(p.isin)?.name;
		if (name && looksLikeBareTicker(p.name)) p.name = name;
	}
	return classified.map((p) =>
		isResidualId(p.id) ? p : { ...p, issuerIdentity: identityOf(p, profiles) },
	);
}

export function measureCoverage(
	etfInputs: readonly EngineEtfInput[],
	dissolutions: readonly EtfDissolution[],
	valuedTotal: number,
): { coverage: BookCoverage; sleeves: XRayOpaqueSleeve[] } {
	const { coverage, opaque } = joinSleeves(etfInputs, dissolutions);
	return {
		coverage: computeBookCoverage(coverage, valuedTotal),
		sleeves: deriveOpaqueSleeves(opaque, valuedTotal),
	};
}
