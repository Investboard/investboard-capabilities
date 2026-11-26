import { isIsinShape } from "../isin.js";
import { positionIdentity } from "./identity.js";
import type { EngineEtfInput } from "./types.js";

/** Fund rows share a valid ISIN across accounts, with ticker identity as the fallback. */
export function fundIdentity(
	etf: Pick<EngineEtfInput, "isin" | "ticker">,
): string | null {
	return positionIdentity(normalisedIsin(etf.isin), etf.ticker);
}

/** Normalized valid ISIN; provider placeholders cannot join unrelated funds. */
export function normalisedIsin(isin: string | null | undefined): string | null {
	const value = isin?.trim().toUpperCase();
	return value && isIsinShape(value) ? value : null;
}
