import { describe, expect, it } from "vitest";
import { buildIssuerVector } from "../../src/internal/concentration/issuer-vector.js";
import type { ConcentrationPosition } from "../../src/internal/concentration/types.js";
const pos = (
	p: Partial<ConcentrationPosition> &
		Pick<ConcentrationPosition, "issuerId" | "value">,
): ConcentrationPosition => ({
	issuerName: p.issuerId,
	assetClass: "equities",
	isResidual: false,
	isUnvalued: false,
	...p,
});
describe("buildIssuerVector", () => {
	it("aggregates rows of the same issuer and weights by the equity book", () => {
		const { issuers } = buildIssuerVector([
			pos({ issuerId: "02079K", issuerName: "Alphanumeric", value: 30 }),
			pos({ issuerId: "02079K", issuerName: "Alphanumeric", value: 10 }),
			pos({ issuerId: "037833", issuerName: "Alder", value: 60 }),
		]);
		expect(issuers.find((i) => i.issuerId === "02079K")?.weight).toBeCloseTo(
			0.4,
			6,
		);
		expect(issuers.find((i) => i.issuerId === "037833")?.weight).toBeCloseTo(
			0.6,
			6,
		);
	});
	it("excludes cash, bonds and physical assets from BOTH sides of the ratio", () => {
		const { issuers } = buildIssuerVector([
			pos({ issuerId: "AAA", value: 50 }),
			pos({ issuerId: "CASH", value: 30, assetClass: "cash" }),
			pos({ issuerId: "BUND", value: 20, assetClass: "bonds" }),
			pos({ issuerId: "GOLD", value: 100, assetClass: "gold" }),
		]);
		expect(issuers).toHaveLength(1);
		expect(issuers[0]?.weight).toBeCloseTo(1, 6);
	});
	it("excludes a residual (a fund's undissolved remainder) from the numerator but keeps it in the denominator (IOB-1)", () => {
		const { issuers, attributed, unattributed } = buildIssuerVector([
			pos({ issuerId: "037833", issuerName: "Alder", value: 50 }),
			pos({
				issuerId: "residual:CORE",
				issuerName: "Synthetic Core World",
				value: 50,
				isResidual: true,
			}),
		]);
		expect(issuers).toHaveLength(1);
		expect(issuers[0]?.issuerId).toBe("037833");
		expect(issuers[0]?.weight).toBeCloseTo(0.5, 6);
		expect(issuers.some((i) => i.issuerId.startsWith("residual:"))).toBe(false);
		expect(attributed).toBeCloseTo(0.5, 6);
		expect(unattributed).toBeCloseTo(0.5, 6);
	});
	it("reports attribution as the equity book's see-through coverage", () => {
		const { attributed, unattributed } = buildIssuerVector([
			pos({ issuerId: "AAA", value: 90 }),
			pos({ issuerId: "residual:WRLD", value: 10, isResidual: true }),
			pos({ issuerId: "CASH", value: 500, assetClass: "cash" }),
		]);
		expect(attributed).toBeCloseTo(0.9, 6);
		expect(unattributed).toBeCloseTo(0.1, 6);
	});
	it("includes every valued holding and drops only unvalued rows", () => {
		const { issuers } = buildIssuerVector([
			pos({ issuerId: "AAA", value: 40 }),
			pos({ issuerId: "BBB", value: 60 }),
			pos({ issuerId: "SAT", value: 100 }),
			pos({ issuerId: "UNV", value: 999, isUnvalued: true }),
		]);
		expect(issuers.find((i) => i.issuerId === "AAA")?.weight).toBeCloseTo(
			0.2,
			6,
		);
		expect(issuers.find((i) => i.issuerId === "SAT")?.weight).toBeCloseTo(
			0.5,
			6,
		);
		expect(issuers.some((i) => i.issuerId === "UNV")).toBe(false);
	});
	it("returns an empty vector and zero attribution for a denominator of zero", () => {
		expect(buildIssuerVector([pos({ issuerId: "AAA", value: 0 })])).toEqual({
			issuers: [],
			attributed: 0,
			unattributed: 0,
			bookValue: 0,
		});
	});
	it("returns an empty vector when the book holds no equity at all", () => {
		expect(
			buildIssuerVector([
				pos({ issuerId: "GOLD", value: 100, assetClass: "gold" }),
			]),
		).toEqual({ issuers: [], attributed: 0, unattributed: 0, bookValue: 0 });
	});
	it("sorts issuers by weight descending", () => {
		const { issuers } = buildIssuerVector([
			pos({ issuerId: "small", value: 10 }),
			pos({ issuerId: "big", value: 90 }),
		]);
		expect(issuers.map((i) => i.issuerId)).toEqual(["big", "small"]);
	});
});
