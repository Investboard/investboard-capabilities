/** Joining issuer keys across ISINs and verified names. */
import { isIsinShape } from "../isin.js";
import { isResidualId } from "./identity.js";
import {
	issuerKeyForIsin,
	issuerKeyForPosition,
	verifiedIssuerNameKey,
} from "./issuer.js";
import type { IssuerIdentityLike } from "./types.js";
type IssuerPosition = {
	id: string;
	isin: string | null;
	name: string;
	issuerIdentity?: IssuerIdentityLike | null;
};
export function canonicalIssuerIdentities(
	positions: readonly IssuerPosition[],
): {
	keys: string[];
	aliases: Record<string, string>;
} {
	const parents = new Map<string, string>();
	const byIsin = new Map<string, string>();
	const byVerifiedName = new Map<string, string>();
	const root = (key: string): string => {
		let result = key;
		while (parents.has(result)) result = parents.get(result) as string;
		let current = key;
		while (parents.has(current)) {
			const next = parents.get(current) as string;
			parents.set(current, result);
			current = next;
		}
		return result;
	};
	const union = (left: string, right: string): void => {
		const a = root(left);
		const b = root(right);
		if (a !== b) parents.set(a < b ? b : a, a < b ? a : b);
	};
	const joinOn = (index: Map<string, string>, token: string, key: string) => {
		const previous = index.get(token);
		if (previous) union(previous, key);
		else index.set(token, key);
	};
	const abandoned = new Map<string, string>();
	const keys = positions.map((position) => {
		if (isResidualId(position.id)) return position.id;
		const key = issuerKeyForPosition(position) ?? position.id;
		const isin = position.isin?.trim().toUpperCase();
		if (isin && isIsinShape(isin)) joinOn(byIsin, isin, key);
		const verified = verifiedIssuerNameKey(position.issuerIdentity);
		if (verified) joinOn(byVerifiedName, verified, key);
		if (position.issuerIdentity?.receipt && verified) {
			const cusip6 = issuerKeyForIsin(position.isin);
			if (cusip6 && cusip6 !== key) abandoned.set(cusip6, key);
		}
		return key;
	});
	const aliases: Record<string, string> = {};
	const canonicalKeys = keys.map((key) => {
		const canonical = root(key);
		if (canonical !== key) aliases[key] = canonical;
		return canonical;
	});
	for (const [cusip6, key] of abandoned) {
		if (!Object.hasOwn(aliases, cusip6)) aliases[cusip6] = root(key);
	}
	return { keys: canonicalKeys, aliases };
}
