/** Issuer keys: US CUSIP-6 prefixes and normalised company names. */
import { isIsinShape } from "../isin.js";
import { stripDepositaryReceiptMarkers } from "./receipt-markers.js";
import type { IssuerIdentityLike } from "./types.js";
export function issuerKeyForIsin(
	isin: string | null | undefined,
): string | null {
	const normalized = isin?.trim().toUpperCase();
	if (!normalized || !isIsinShape(normalized)) return null;
	if (!normalized.startsWith("US")) return null;
	const cusip6 = normalized.slice(2, 8);
	if (!/^[0-9A-Z]{6}$/.test(cusip6)) return null;
	return `cusip6:${cusip6}`;
}
const LEGAL_FORM_TOKENS = new Set([
	"se",
	"ag",
	"nv",
	"plc",
	"sa",
	"spa",
	"oyj",
	"ab",
	"asa",
	"group",
	"holding",
	"holdings",
	"inc",
	"corp",
	"co",
	"ltd",
	"the",
]);
const BOND_DESCRIPTOR_TOKENS = new Set(["float", "frn", "callable", "call"]);
const MATURITY_PATTERNS: readonly RegExp[] = [
	/^(19|20)\d{2}$/,
	/^\d{1,2}[a-z]{3}(19|20)\d{2}$/,
	/^[a-z]{3}(19|20)\d{2}$/,
	/^(19|20)\d{2}[a-z]{3}\d{1,2}$/,
	/^\d{6,8}$/,
];
function isMaturityToken(token: string): boolean {
	for (const pattern of MATURITY_PATTERNS) {
		if (pattern.test(token)) return true;
	}
	return false;
}
function stripDots(token: string): string {
	return token.replace(/\./g, "");
}
export function normalizeIssuerName(
	name: string | null | undefined,
): string | null {
	if (!name) return null;
	const folded = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
	const tokens: string[] = [];
	for (const raw of folded.split(/[\s,]+/)) {
		if (!raw) continue;
		const cleaned = raw.replace(/[^a-z0-9.%]/g, "");
		if (!cleaned) continue;
		if (/^\d+(\.\d+)?%$/.test(cleaned)) continue;
		if (/^\d+\.\d+$/.test(cleaned)) continue;
		const token = stripDots(cleaned);
		if (!token) continue;
		if (isMaturityToken(token)) continue;
		if (BOND_DESCRIPTOR_TOKENS.has(token)) continue;
		if (LEGAL_FORM_TOKENS.has(token)) continue;
		tokens.push(token);
	}
	if (tokens.length === 0) return null;
	return tokens.join(" ");
}
export function verifiedIssuerNameKey(
	identity: IssuerIdentityLike | null | undefined,
): string | null {
	const normalized = normalizeIssuerName(
		stripDepositaryReceiptMarkers(identity?.verifiedName),
	);
	return normalized ? `issuer-name:${normalized}` : null;
}
export function isUnresolvedReceipt(
	identity: IssuerIdentityLike | null | undefined,
): boolean {
	return identity?.receipt === true && verifiedIssuerNameKey(identity) === null;
}
export function issuerKeyForPosition(input: {
	isin: string | null | undefined;
	name: string | null | undefined;
	issuerIdentity?: IssuerIdentityLike | null;
}): string | null {
	if (input.issuerIdentity?.receipt)
		return verifiedIssuerNameKey(input.issuerIdentity);
	const cusip6Key = issuerKeyForIsin(input.isin);
	if (cusip6Key) return cusip6Key;
	const verifiedKey = verifiedIssuerNameKey(input.issuerIdentity);
	if (verifiedKey) return verifiedKey;
	const nameKey = normalizeIssuerName(input.name);
	if (nameKey) return `issuer-name:${nameKey}`;
	return null;
}
