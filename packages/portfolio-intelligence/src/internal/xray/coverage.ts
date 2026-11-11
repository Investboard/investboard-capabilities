/** How much of the portfolio is seen through, held whole by nature, or pending missing data. */
export interface CoverageEtfInput {
	value: number;
	coveredWeight: number;
	degraded: boolean;
	hasEquityConstituents: boolean;
}
export interface BookCoverage {
	transparent: number;
	opaqueInherent: number;
	opaquePending: number;
}
export function computeBookCoverage(
	etfs: CoverageEtfInput[],
	bookValue: number,
): BookCoverage {
	if (!Number.isFinite(bookValue) || bookValue <= 0) {
		return { transparent: 0, opaqueInherent: 0, opaquePending: 0 };
	}
	let transparentV = 0;
	let inherentV = 0;
	let pendingV = 0;
	for (const e of etfs) {
		const covered = Math.max(0, Math.min(1, e.coveredWeight));
		transparentV += e.value * covered;
		const opaqueV = e.value * (1 - covered);
		if (e.degraded) {
			pendingV += opaqueV;
		} else {
			inherentV += opaqueV;
		}
	}
	const etfTotal = etfs.reduce((acc, e) => acc + e.value, 0);
	const directTransparent = Math.max(0, bookValue - etfTotal);
	transparentV += directTransparent;
	return {
		transparent: transparentV / bookValue,
		opaqueInherent: inherentV / bookValue,
		opaquePending: pendingV / bookValue,
	};
}
