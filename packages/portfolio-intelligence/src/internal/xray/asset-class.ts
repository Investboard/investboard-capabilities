/** Asset classes: normalising labels, resolving a fund's class from its stated and reported class, and the classes never looked through. */
import { UNKNOWN_HOLDING_CLASS } from "../contracts.js";
export const XRAY_ASSET_CLASSES = [
	"equities",
	"bonds",
	"gold",
	"crypto",
	"cash",
	"alternatives",
	"real_estate",
	"commodities",
] as const;
const VALID = new Set<string>(XRAY_ASSET_CLASSES);
export const UNKNOWN_ASSET_CLASS: string = UNKNOWN_HOLDING_CLASS;
export function normalizeAssetClass(raw: string): string {
	return VALID.has(raw) ? raw : "alternatives";
}
export function mapReportedFundClass(
	label: string | null | undefined,
): string | null {
	const v = label?.trim().toLowerCase();
	if (!v) return null;
	switch (v) {
		case "equity":
		case "equities":
			return "equities";
		case "fixed income":
		case "bond":
		case "bonds":
			return "bonds";
		case "commodity":
		case "commodities":
			return "commodities";
		case "real estate":
			return "real_estate";
		case "money market":
		case "cash":
			return "cash";
		case "digital assets":
		case "cryptocurrency":
		case "crypto":
			return "crypto";
		case "alternative":
		case "alternatives":
			return "alternatives";
		case "gold":
			return "gold";
		default:
			return null;
	}
}
export const NEVER_LOOKED_THROUGH_CLASSES: ReadonlySet<string> = new Set([
	"cash",
	"bonds",
	"gold",
	"crypto",
] satisfies readonly (typeof XRAY_ASSET_CLASSES)[number][]);
export function isNeverLookedThroughClass(
	assetClass: string | null | undefined,
): boolean {
	return (
		assetClass != null &&
		NEVER_LOOKED_THROUGH_CLASSES.has(normalizeAssetClass(assetClass))
	);
}
export const SPECIFIC_FUND_CLASSES: ReadonlySet<string> = new Set([
	"cash",
	"bonds",
	"gold",
	"crypto",
	"real_estate",
	"commodities",
] satisfies readonly (typeof XRAY_ASSET_CLASSES)[number][]);
export function resolveFundClass(
	storedClass: string,
	providerClass: string | null,
): string | null {
	if (SPECIFIC_FUND_CLASSES.has(storedClass)) return storedClass;
	if (providerClass !== null) return providerClass;
	return VALID.has(storedClass) ? storedClass : null;
}
