import { describe, expect, it } from "vitest";
import { issuerKeyForPosition } from "../../src/internal/xray/issuer.js";
import { canonicalIssuerIdentities } from "../../src/internal/xray/issuer-identities.js";
import {
	hasDepositaryReceiptMarker,
	stripDepositaryReceiptMarkers,
} from "../../src/internal/xray/receipt-markers.js";
const MAPLE_ORDINARY = {
	id: "isin:DESYN3691660",
	isin: "DESYN3691660",
	name: "MAPLE SE O.N.",
	issuerIdentity: {
		verifiedName: "MAPLE SE",
		receipt: false,
		source: "caller" as const,
	},
};
const MAPLE_ADR = {
	id: "isin:US6666662042",
	isin: "US6666662042",
	name: "MAPLE SE ADR",
	issuerIdentity: {
		verifiedName: "MAPLE SE",
		receipt: true,
		source: "caller" as const,
	},
};
describe("issuerKeyForPosition with a verified identity (R1)", () => {
	it("keys a receipt by its verified company name, never by its US CUSIP", () => {
		expect(issuerKeyForPosition(MAPLE_ADR)).toBe("issuer-name:maple");
		expect(issuerKeyForPosition(MAPLE_ORDINARY)).toBe("issuer-name:maple");
	});
	it("prefers the verified name over the broker's row name on a non-US line", () => {
		expect(
			issuerKeyForPosition({
				isin: "DESYN3691660",
				name: "MAPLE SE O.N. NAMENS-AKTIEN",
				issuerIdentity: {
					verifiedName: "MAPLE SE",
					receipt: false,
					source: "caller",
				},
			}),
		).toBe("issuer-name:maple");
	});
	it("keeps CUSIP-6 for a US line that is not a receipt", () => {
		expect(
			issuerKeyForPosition({
				isin: "US2222223059",
				name: "Alphanumeric Inc. Class A",
				issuerIdentity: {
					verifiedName: "Alphanumeric Inc.",
					receipt: false,
					source: "caller",
				},
			}),
		).toBe("cusip6:222222");
	});
	it("leaves a receipt without a verified name unresolved (null key)", () => {
		expect(
			issuerKeyForPosition({
				isin: "US6666662042",
				name: "MAPLE SE ADR",
				issuerIdentity: {
					verifiedName: null,
					receipt: true,
					source: "row_name",
				},
			}),
		).toBeNull();
	});
	it("strips the receipt marker and sponsorship from the verified name, so the provider's own ADR name keys to the share", () => {
		for (const verifiedName of [
			"MAPLE SE Sponsored ADR",
			"MAPLE SE ADR",
			"MAPLE SE Unsponsored ADR",
			"MAPLE SE ADRhedged",
			"MAPLE SE Depositary Receipt",
			"MAPLE SE CEDEAR",
		]) {
			expect(
				issuerKeyForPosition({
					...MAPLE_ADR,
					issuerIdentity: { ...MAPLE_ADR.issuerIdentity, verifiedName },
				}),
			).toBe("issuer-name:maple");
		}
		expect(
			issuerKeyForPosition({
				...MAPLE_ADR,
				issuerIdentity: { ...MAPLE_ADR.issuerIdentity, verifiedName: "ADR" },
			}),
		).toBeNull();
	});
	it("never reads a marker glued to digits or hyphenated into a company name", () => {
		expect(hasDepositaryReceiptMarker("ASP-TEC Energy PLC")).toBe(false);
		expect(hasDepositaryReceiptMarker("ADR120S, Inc.")).toBe(false);
		expect(hasDepositaryReceiptMarker("MAPLE SE Sponsored ADR")).toBe(true);
		expect(hasDepositaryReceiptMarker("Vale S.A. BDRs")).toBe(true);
		expect(hasDepositaryReceiptMarker("CDR", "CDR")).toBe(false);
		expect(stripDepositaryReceiptMarkers("ASP-TEC Energy PLC")).toBe(
			"ASP-TEC Energy PLC",
		);
		expect(stripDepositaryReceiptMarkers("Baidu Inc. ADR")).toBe("Baidu Inc.");
		expect(stripDepositaryReceiptMarkers("Sponsored ADR")).toBeNull();
	});
	it("behaves exactly as before when no identity is attached", () => {
		expect(
			issuerKeyForPosition({ isin: "US6666662042", name: "MAPLE SE ADR" }),
		).toBe("cusip6:666666");
		expect(
			issuerKeyForPosition({ isin: "DESYN3691660", name: "MAPLE SE" }),
		).toBe("issuer-name:maple");
	});
});
describe("canonicalIssuerIdentities with verified names (R1)", () => {
	it("joins an ordinary share and its receipt into one issuer", () => {
		const { keys } = canonicalIssuerIdentities([MAPLE_ORDINARY, MAPLE_ADR]);
		expect(keys[0]).toBe(keys[1]);
		expect(keys[0]).toBe("issuer-name:maple");
	});
	it("joins a receipt whose provider name carries the marker with the ordinary share, and aliases the CUSIP key it abandoned", () => {
		const { keys, aliases } = canonicalIssuerIdentities([
			MAPLE_ORDINARY,
			{
				...MAPLE_ADR,
				issuerIdentity: {
					...MAPLE_ADR.issuerIdentity,
					verifiedName: "MAPLE SE Sponsored ADR",
				},
			},
		]);
		expect(keys).toEqual(["issuer-name:maple", "issuer-name:maple"]);
		expect(aliases["cusip6:666666"]).toBe("issuer-name:maple");
	});
	it("joins a CUSIP-keyed US line with a foreign twin that carries the same verified name", () => {
		const usLine = {
			id: "isin:US1111111005",
			isin: "US1111111005",
			name: "Alder Inc.",
			issuerIdentity: {
				verifiedName: "Alder Inc.",
				receipt: false,
				source: "caller" as const,
			},
		};
		const foreignTwin = {
			id: "isin:XS0000000001",
			isin: "XS0000000001",
			name: "ALDER 1.5% 2030",
			issuerIdentity: {
				verifiedName: "Alder Inc.",
				receipt: false,
				source: "caller" as const,
			},
		};
		const { keys, aliases } = canonicalIssuerIdentities([usLine, foreignTwin]);
		expect(keys[0]).toBe(keys[1]);
		expect(Object.keys(aliases)).toHaveLength(1);
	});
	it("never joins two issuers whose verified names differ", () => {
		const { keys } = canonicalIssuerIdentities([
			MAPLE_ADR,
			{
				id: "isin:US7777772048",
				isin: "US7777772048",
				name: "Maplewood ADR",
				issuerIdentity: {
					verifiedName: "Maplewood International",
					receipt: true,
					source: "caller" as const,
				},
			},
		]);
		expect(keys[0]).not.toBe(keys[1]);
	});
	it("keeps an unresolved receipt on its own identity", () => {
		const { keys } = canonicalIssuerIdentities([
			MAPLE_ORDINARY,
			{
				id: "isin:US6666662042",
				isin: "US6666662042",
				name: "MAPLE SE ADR",
				issuerIdentity: {
					verifiedName: null,
					receipt: true,
					source: "row_name" as const,
				},
			},
		]);
		expect(keys[1]).toBe("isin:US6666662042");
		expect(keys[0]).toBe("issuer-name:maple");
	});
});
