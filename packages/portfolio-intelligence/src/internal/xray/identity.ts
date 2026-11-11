/** Stable position ids: ISIN first, ticker otherwise, and residual rows. */
export function positionIdentity(
	isin: string | null | undefined,
	identifier: string | null | undefined,
): string | null {
	const normalizedIsin = isin?.trim().toUpperCase();
	if (normalizedIsin) return `isin:${normalizedIsin}`;
	const normalizedTicker = identifier?.trim().toUpperCase();
	if (normalizedTicker) return `ticker:${normalizedTicker}`;
	return null;
}
export const RESIDUAL_ID_PREFIX = "residual:";
export function isResidualId(id: string): boolean {
	return id.startsWith(RESIDUAL_ID_PREFIX);
}
