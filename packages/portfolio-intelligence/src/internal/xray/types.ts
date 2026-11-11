/** Engine types shared by the look-through modules. */
import type { IssuerIdentitySource } from "../contracts.js";
export type DissolutionStatus = "full" | "partial" | "none";
export interface ClassificationVectorEntry {
	key: string;
	weight: number;
}
export interface EngineDirectHolding {
	ticker: string;
	isin: string | null;
	name: string;
	value: number;
	assetClass: string;
	sector?: string | null;
	country?: string | null;
}
export interface EngineEtfInput {
	ticker: string;
	isin: string | null;
	name: string;
	value: number;
	underlyingAssetClass: string | null;
	constituents: Array<{
		identifier: string;
		isin: string | null;
		name: string;
		weight: number;
	}>;
	sectorVector?: ClassificationVectorEntry[] | null;
	countryVector?: ClassificationVectorEntry[] | null;
	industryVector?: ClassificationVectorEntry[] | null;
	degraded?: boolean;
	indexRead?: FundIndexDisclosure;
	heldWholeAs?: string | null;
	asOf: string | null;
}
export interface FundIndexDisclosure {
	index: string;
	fund: string;
}
export interface EtfDissolution {
	ticker: string;
	name: string;
	status: DissolutionStatus;
	coveredWeight: number;
	degraded: boolean;
	indexRead?: FundIndexDisclosure;
	asOf: string | null;
}
export interface DissolvedExposure {
	id: string;
	isin: string | null;
	ticker: string | null;
	name: string;
	value: number;
	assetClass: string;
	fundId?: string;
	etf: string;
	shareInEtf: number;
	residual: boolean;
	issuerScopeUncertain?: boolean;
	fundName?: string;
}
export interface ProvenanceSource {
	id?: string;
	name?: string;
	value?: number;
	etf: string;
	weight: number;
	shareInEtf: number;
}
export interface IssuerIdentityLike {
	verifiedName: string | null;
	receipt: boolean;
	source: IssuerIdentitySource;
}
export interface MergedPosition {
	id: string;
	isin: string | null;
	ticker: string | null;
	name: string;
	value: number;
	weight: number;
	assetClass: string;
	issuerScopeUncertain?: boolean;
	issuerIdentity?: IssuerIdentityLike;
	sektor: string | null;
	region: string | null;
	provenance: {
		direct: number;
		directValue?: number;
		viaFunds: ProvenanceSource[];
	};
}
export interface IssuerGroup {
	key: string;
	name: string;
	value: number;
	weight: number;
	grouped: boolean;
	breakdown: MergedPosition[];
}
export interface OverlapPairV2 {
	etfA: string;
	etfB: string;
	isinA: string | null;
	isinB: string | null;
	overlapShare: number;
	sharedCount: number;
	sharedHoldings: Array<{
		id: string;
		name: string;
		weightInA: number;
		weightInB: number;
	}>;
	sharedTail: {
		count: number;
		weight: number;
	} | null;
}
