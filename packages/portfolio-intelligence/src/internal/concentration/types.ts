import type { IssuerSources } from "../contracts.js";
export interface ConcentrationPosition {
	issuerId: string;
	issuerName: string;
	value: number;
	assetClass: string;
	issuerScopeUncertain?: boolean;
	isResidual: boolean;
	isUnvalued: boolean;
}
export interface IssuerWeight {
	issuerId: string;
	issuerName: string;
	weight: number;
	sources?: IssuerSources;
}
export interface IssuerVectorResult {
	issuers: IssuerWeight[];
	attributed: number;
	unattributed: number;
	bookValue: number;
}
export type ConcentrationRefusal = "coverage_below_floor" | "empty_book";
export interface LegAResult {
	issuerAliases?: Record<string, string>;
	maxIssuer: IssuerWeight | null;
	issuers: IssuerWeight[];
	capFraction: number;
	breached: boolean;
	approaching: boolean;
	coverage: number;
	equityBookValue: number;
	refusal: ConcentrationRefusal | null;
	hhi: number;
	effectiveN: number | null;
}
export interface LegBResult {
	bucketIssuers: IssuerWeight[];
	bucketWeight: number;
	breached: boolean;
	approaching: boolean;
}
