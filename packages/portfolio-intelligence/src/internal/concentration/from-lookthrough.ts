import { normalizeAssetClass } from "../xray/asset-class.js";
import { isResidualId } from "../xray/identity.js";
import { issuerKeyForPosition, isUnresolvedReceipt } from "../xray/issuer.js";
import { canonicalIssuerIdentities } from "../xray/issuer-identities.js";
import type { IssuerIdentityLike } from "../xray/types.js";
import { attachIssuerSources, type SourceValues } from "./issuer-sources.js";
import { evaluateLegA } from "./leg-a.js";
import type { ConcentrationPosition, LegAResult } from "./types.js";
export interface LookThroughRowLike {
	id: string;
	isin: string | null;
	name: string;
	value: number;
	assetClass: string;
	issuerScopeUncertain?: boolean;
	issuerIdentity?: IssuerIdentityLike | null;
	provenance?: SourceValues;
}
export function toConcentrationPosition(
	row: LookThroughRowLike,
): ConcentrationPosition {
	const unresolved = isUnresolvedReceipt(row.issuerIdentity);
	return {
		issuerId:
			issuerKeyForPosition({
				isin: row.isin,
				name: row.name,
				issuerIdentity: row.issuerIdentity,
			}) ?? row.id,
		issuerName: row.issuerIdentity?.verifiedName ?? row.name,
		value: row.value,
		assetClass: normalizeAssetClass(row.assetClass.trim().toLowerCase()),
		...(row.issuerScopeUncertain || unresolved
			? { issuerScopeUncertain: true }
			: {}),
		isResidual: isResidualId(row.id),
		isUnvalued: !Number.isFinite(row.value) || row.value <= 0,
	};
}
export function evaluateIssuerConcentration(input: {
	rows: readonly LookThroughRowLike[];
	capPct: number;
	unlistedValueByClass?: Record<string, number>;
}): LegAResult {
	const identities = canonicalIssuerIdentities(input.rows);
	const positions = input.rows.map((row, index) => ({
		...toConcentrationPosition(row),
		issuerId: identities.keys[index] ?? row.id,
	}));
	const result = evaluateLegA({
		positions,
		capPct: input.capPct,
		...(input.unlistedValueByClass
			? { unlistedValueByClass: input.unlistedValueByClass }
			: {}),
	});
	const issuers = attachIssuerSources(
		result.issuers,
		positions,
		input.rows.map((row) => row.provenance),
		result.equityBookValue,
	);
	return {
		...result,
		issuers,
		maxIssuer: result.maxIssuer
			? (issuers.find(
					(issuer) => issuer.issuerId === result.maxIssuer?.issuerId,
				) ?? result.maxIssuer)
			: null,
		issuerAliases: identities.aliases,
	};
}
