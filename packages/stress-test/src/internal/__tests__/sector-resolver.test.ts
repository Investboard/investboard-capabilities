import { describe, expect, it, vi } from "vitest";
import { resolveStressTestSector } from "../scenarios/sector-enum.js";

describe("resolveStressTestSector", () => {
	it("maps standard GICS sectors directly", () => {
		const sectors = [
			"Technology",
			"Healthcare",
			"Financials",
			"Consumer Discretionary",
			"Consumer Staples",
			"Industrials",
			"Energy",
			"Materials",
			"Utilities",
			"Real Estate",
			"Communication Services",
		] as const;

		for (const sector of sectors) {
			expect(resolveStressTestSector(sector, "equities")).toBe(sector);
		}
	});

	it("returns 'Other' for non-equity asset classes", () => {
		const nonEquityClasses = [
			"bonds",
			"gold",
			"crypto",
			"cash",
			"alternatives",
		];

		for (const assetClass of nonEquityClasses) {
			expect(resolveStressTestSector("Technology", assetClass)).toBe("Other");
		}
	});

	it("returns 'Other' for null sector with equity asset class", () => {
		expect(resolveStressTestSector(null, "equities")).toBe("Other");
	});

	it("maps German sector names to canonical GICS sectors", () => {
		expect(resolveStressTestSector("Technologie", "equities")).toBe(
			"Technology",
		);
		expect(resolveStressTestSector("Gesundheitswesen", "equities")).toBe(
			"Healthcare",
		);
		expect(resolveStressTestSector("Finanzen", "equities")).toBe("Financials");
		expect(resolveStressTestSector("Versorger", "equities")).toBe("Utilities");
		expect(resolveStressTestSector("Immobilien", "equities")).toBe(
			"Real Estate",
		);
	});

	it("matches sectors case-insensitively", () => {
		expect(resolveStressTestSector("technology", "equities")).toBe(
			"Technology",
		);
		expect(resolveStressTestSector("FINANCIALS", "equities")).toBe(
			"Financials",
		);
	});

	it("normalizes FMP variant sector strings", () => {
		expect(resolveStressTestSector("Financial Services", "equities")).toBe(
			"Financials",
		);
		expect(resolveStressTestSector("Communication", "equities")).toBe(
			"Communication Services",
		);
		expect(resolveStressTestSector("Consumer Cyclical", "equities")).toBe(
			"Consumer Discretionary",
		);
		expect(resolveStressTestSector("Consumer Defensive", "equities")).toBe(
			"Consumer Staples",
		);
		expect(resolveStressTestSector("Basic Materials", "equities")).toBe(
			"Materials",
		);
	});

	it("returns 'Other' and warns for truly unmatchable sectors", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(
			resolveStressTestSector("Underwater Basket Weaving", "equities"),
		).toBe("Other");
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("Unmapped sector"),
		);

		warnSpy.mockRestore();
	});

	it("returns 'Other' for empty string sector", () => {
		expect(resolveStressTestSector("", "equities")).toBe("Other");
	});
});
