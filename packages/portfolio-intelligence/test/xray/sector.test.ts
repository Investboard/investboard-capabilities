import { describe, expect, it } from "vitest";
import {
	normalizeSector,
	XRAY_SECTORS,
} from "../../src/internal/xray/sector.js";
describe("normalizeSector", () => {
	it("maps sector display names to the canonical set", () => {
		expect(normalizeSector("Technology")).toBe("technology");
		expect(normalizeSector("Information Technology")).toBe("technology");
		expect(normalizeSector("Financial Services")).toBe("financials");
		expect(normalizeSector("Consumer Cyclical")).toBe("consumerDiscretionary");
		expect(normalizeSector("Consumer Defensive")).toBe("consumerStaples");
		expect(normalizeSector("Healthcare")).toBe("healthcare");
		expect(normalizeSector("Basic Materials")).toBe("materials");
		expect(normalizeSector("Communication Services")).toBe("communication");
	});
	it("returns null (NOT a coalesced string) for unknown/empty input: the unknown bucket is structured", () => {
		expect(normalizeSector("")).toBeNull();
		expect(normalizeSector("Frontier Quantum Memes")).toBeNull();
		expect(normalizeSector(null)).toBeNull();
	});
	it("maps a 'Cash & Others' fund cash sleeve to null: a cash sleeve has no sector", () => {
		expect(normalizeSector("Cash & Others")).toBeNull();
	});
	it("every canonical sector id is covered by at least one mapping", () => {
		const mapped = new Set(
			[
				"Technology",
				"Financial Services",
				"Healthcare",
				"Industrials",
				"Consumer Cyclical",
				"Consumer Defensive",
				"Energy",
				"Utilities",
				"Basic Materials",
				"Real Estate",
				"Communication Services",
			].map((n) => normalizeSector(n)),
		);
		for (const s of XRAY_SECTORS) expect(mapped.has(s)).toBe(true);
	});
});
