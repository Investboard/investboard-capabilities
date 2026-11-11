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
	let bookValue = unattributedInBookValue;
	for (const e of entries) {
		if (e.inBook) bookValue += e.pos.value;
	}
	if (bookValue <= 0) {
		return { issuers: [], attributed: 0, unattributed: 0, bookValue: 0 };
	}
	const byIssuer = new Map<
		string,
		{
			name: string;
			value: number;
		}
	>();
	let attributedValue = 0;
	for (const e of entries) {
		if (!e.attributable) continue;
		attributedValue += e.pos.value;
		const existing = byIssuer.get(e.pos.issuerId);
		if (existing) {
			existing.value += e.pos.value;
		} else {
			byIssuer.set(e.pos.issuerId, {
				name: e.pos.issuerName,
				value: e.pos.value,
			});
		}
	}
	const issuers: IssuerWeight[] = [];
	for (const [issuerId, agg] of byIssuer) {
		issuers.push({
			issuerId,
			issuerName: agg.name,
			weight: agg.value / bookValue,
		});
	}
	issuers.sort((a, b) => b.weight - a.weight);
	const attributed = attributedValue / bookValue;
	return { issuers, attributed, unattributed: 1 - attributed, bookValue };
}
