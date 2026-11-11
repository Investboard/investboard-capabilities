/** Classifying securities from caller-supplied profiles, with the rules for what a profile may say about a position. */
import type { HoldingInput, SecurityProfile } from "../../types.js";
import { UNKNOWN_HOLDING_CLASS } from "../contracts.js";
import { normalizeAssetClass } from "../xray/asset-class.js";
import { normalizeCountry } from "../xray/country.js";
import { isEquityAxisDirect } from "../xray/equity-axis.js";
import { normalizeSector, type XraySector } from "../xray/sector.js";
import type { EngineDirectHolding } from "../xray/types.js";

export type ValuedHolding = HoldingInput & { value: number };

export function normalizeIsin(raw: string | null | undefined): string | null {
	return raw?.trim().toUpperCase() || null;
}

/** Profiles keyed by normalised ISIN; the first profile of an ISIN wins. */
export function profileMap(
	securities: readonly SecurityProfile[],
): ReadonlyMap<string, SecurityProfile> {
	const map = new Map<string, SecurityProfile>();
	for (const security of securities) {
		const isin = normalizeIsin(security.isin);
		if (isin && !map.has(isin)) map.set(isin, security);
	}
	return map;
}

export interface ClassifiablePosition {
	isin: string | null;
	assetClass: string;
	heldDirectly: boolean;
}

/**
 * A profile describes a position only on the equity axes, and a profile with
 * a null class (a fund's own profile) never describes a directly held line.
 */
export function profileOf(
	position: ClassifiablePosition,
	profiles: ReadonlyMap<string, SecurityProfile>,
): Pick<SecurityProfile, "sector" | "country"> | null {
	if (!position.isin) return null;
	if (!isEquityAxisDirect(position)) return null;
	const profile = profiles.get(position.isin);
	if (!profile) return null;
	if (position.heldDirectly && profile.assetClass === null) return null;
	return { sector: profile.sector ?? null, country: profile.country ?? null };
}

export function classifyDirectHolding(
	position: { isin: string | null; assetClass: string },
	profiles: ReadonlyMap<string, SecurityProfile>,
): { sector: XraySector | null; country: string | null } {
	const profile = profileOf({ ...position, heldDirectly: true }, profiles);
	return {
		sector: normalizeSector(profile?.sector),
		country: normalizeCountry(profile?.country),
	};
}

export function toEngineDirectHoldings(
	holdings: readonly ValuedHolding[],
	profiles: ReadonlyMap<string, SecurityProfile>,
): EngineDirectHolding[] {
	return holdings.map((holding) => {
		const assetClass =
			holding.assetClass === UNKNOWN_HOLDING_CLASS
				? UNKNOWN_HOLDING_CLASS
				: normalizeAssetClass(holding.assetClass);
		const isin = normalizeIsin(holding.isin);
		return {
			ticker: holding.ticker ?? holding.id,
			isin,
			name: holding.name,
			value: holding.value,
			assetClass,
			...classifyDirectHolding({ isin, assetClass }, profiles),
		};
	});
}
