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
const CLASS_PART_MARKER = "|class:";
export function classPartId(id: string, assetClass: string): string {
	return `${id}${CLASS_PART_MARKER}${assetClass}`;
}
export function companyIdOf(id: string): string {
	const at = id.indexOf(CLASS_PART_MARKER);
	return at < 0 ? id : id.slice(0, at);
}
export function singleTitleCount(
	positions: readonly {
		id: string;
	}[],
): number {
	const companies = new Set<string>();
	for (const p of positions)
		if (!isResidualId(p.id)) companies.add(companyIdOf(p.id));
	return companies.size;
}
