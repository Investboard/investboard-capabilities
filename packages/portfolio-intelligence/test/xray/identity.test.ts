import { describe, expect, it } from "vitest";
import { positionIdentity } from "../../src/internal/xray/identity.js";
describe("positionIdentity", () => {
	it("prefers ISIN, uppercased and trimmed", () => {
		expect(positionIdentity(" iesyn4303130 ", "CORE.DE")).toBe(
			"isin:IESYN4303130",
		);
	});
	it("falls back to the ticker-like identifier", () => {
		expect(positionIdentity(null, "aldr")).toBe("ticker:ALDR");
		expect(positionIdentity(undefined, " HLS.B ")).toBe("ticker:HLS.B");
	});
	it("returns null when neither is usable", () => {
		expect(positionIdentity(null, null)).toBeNull();
		expect(positionIdentity("  ", "")).toBeNull();
	});
	it("falls through a whitespace-only ISIN to the ticker", () => {
		expect(positionIdentity("  ", "aldr")).toBe("ticker:ALDR");
	});
});
