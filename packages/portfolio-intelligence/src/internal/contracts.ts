/** The class of a holding nobody could classify. Not one of the eight asset classes. */
export const UNKNOWN_HOLDING_CLASS = "unknown";

export const XRAY_OPAQUE_SLEEVE_REASON_KEYS = [
	"pending",
	"money-market",
	"bond-fund",
	"held-whole",
] as const;

/** Why a fund's value is not looked through. */
export type XRayOpaqueSleeveReasonKey =
	(typeof XRAY_OPAQUE_SLEEVE_REASON_KEYS)[number];

/** A fund, or the uncovered part of one, that is not looked through. */
export interface XRayOpaqueSleeve {
	ticker: string;
	name: string;
	weight: number;
	kind: "inherent" | "pending";
	reason: string;
	reasonKey?: XRayOpaqueSleeveReasonKey;
	assetClass: string;
}

/** Where a verified issuer name came from. */
export type IssuerIdentitySource =
	| "caller"
	| "issuer_map"
	| "manual"
	| "row_name"
	| "none";

/** Where an issuer's weight comes from: held directly, through which funds, or unassigned. */
export interface IssuerSources {
	directWeight: number;
	viaFunds: Array<{ id?: string; name: string; weight: number }>;
	unassignedWeight: number;
}
