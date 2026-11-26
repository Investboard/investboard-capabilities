import { AmountSum } from "../precision.js";
import { normalizeAssetClass } from "../xray/asset-class.js";
import type {
	ConcentrationPosition,
	IssuerVectorResult,
	IssuerWeight,
} from "./types.js";
export function isEquityBookClass(assetClass: string): boolean {
	return assetClass === "equities";
}
export function sumUnlistedInBookValue(
	byClass: Record<string, number> | undefined,
	inBook: (assetClass: string) => boolean,
): number {
	if (!byClass) return 0;
	let total = 0;
	for (const [assetClass, value] of Object.entries(byClass)) {
		if (!Number.isFinite(value) || value <= 0) continue;
		if (inBook(normalizeAssetClass(assetClass.trim().toLowerCase()))) {
			total += value;
		}
	}
	return total;
}
export function buildIssuerVector(
	positions: readonly ConcentrationPosition[],
	unlistedValueByClass?: Record<string, number>,
): IssuerVectorResult {
	const { issuers, attributed, unattributed, bookValue } = aggregateByIssuer(
		positions.map((pos) => {
			const uncertain = pos.issuerScopeUncertain === true;
			const inBook =
				!pos.isUnvalued && (isEquityBookClass(pos.assetClass) || uncertain);
			return {
				pos,
				inBook,
				attributable: inBook && !pos.isResidual && !uncertain,
			};
		}),
		sumUnlistedInBookValue(unlistedValueByClass, isEquityBookClass),
	);
	return { issuers, attributed, unattributed, bookValue };
}
export interface CountedPosition {
	pos: ConcentrationPosition;
	inBook: boolean;
	attributable: boolean;
}
export function aggregateByIssuer(
	entries: readonly CountedPosition[],
	unattributedInBookValue = 0,
): IssuerVectorResult {
	const named = new AmountSum();
	const unknown = new AmountSum();
	unknown.add(unattributedInBookValue);
	const byIssuer = new Map<string, { name: string; amount: AmountSum }>();
	for (const { inBook, attributable, pos } of entries) {
		if (!inBook) continue;
		if (!attributable) {
			unknown.add(pos.value);
			continue;
		}
		named.add(pos.value);
		const issuer = byIssuer.get(pos.issuerId) ?? {
			name: pos.issuerName,
			amount: new AmountSum(),
		};
		issuer.amount.add(pos.value);
		byIssuer.set(pos.issuerId, issuer);
	}
	const bookValue = named.value + unknown.value;
	if (bookValue <= 0)
		return { issuers: [], attributed: 0, unattributed: 0, bookValue: 0 };
	const issuers: IssuerWeight[] = Array.from(
		byIssuer,
		([issuerId, issuer]) => ({
			issuerId,
			issuerName: issuer.name,
			weight: issuer.amount.value / bookValue,
		}),
	);
	issuers.sort((a, b) => b.weight - a.weight);
	return {
		issuers,
		attributed: named.value / bookValue,
		unattributed: unknown.value / bookValue,
		bookValue,
	};
}
