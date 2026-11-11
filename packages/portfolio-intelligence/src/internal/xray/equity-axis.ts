/** Which positions belong on the equity axes (sector, country, region). */
import {
	normalizeAssetClass,
	UNKNOWN_ASSET_CLASS,
	XRAY_ASSET_CLASSES,
} from "./asset-class.js";
import type { EngineDirectHolding, EngineEtfInput } from "./types.js";
export function isOffAxisClass(
	assetClass: string | null | undefined,
): assetClass is string {
	return assetClass != null && OFF_AXIS_CLASSES.has(assetClass);
}
const OFF_AXIS_CLASSES: ReadonlySet<string> = new Set([
	...XRAY_ASSET_CLASSES.filter((c) => c !== "equities"),
	UNKNOWN_ASSET_CLASS,
]);
export function isEquityAxisDirect(
	holding: Pick<EngineDirectHolding, "assetClass">,
): boolean {
	return !isOffAxisClass(holding.assetClass);
}
export function isEquityAxisEtf(
	etf: Pick<EngineEtfInput, "underlyingAssetClass">,
): boolean {
	return (
		etf.underlyingAssetClass == null ||
		!isOffAxisClass(normalizeAssetClass(etf.underlyingAssetClass))
	);
}
