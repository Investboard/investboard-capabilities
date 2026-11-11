import { describe, expect, it } from "vitest";
import {
	classifyExposures,
	type ExposureProfile,
	type ProfileLookup,
} from "../../src/internal/xray/classify-exposures.js";
interface TestPosition {
	isin: string | null;
	value: number;
	sektor: string | null;
	region: string | null;
	name: string;
}
const pos = (
	name: string,
	isin: string | null,
	value: number,
): TestPosition => ({ name, isin, value, sektor: null, region: null });
const STUB: Record<string, ExposureProfile> = {
	US1111111005: { sector: "Technology", country: "United States" },
	US4444441045: { sector: "Information Technology", country: "US" },
};
const lookup: ProfileLookup = (isin) => STUB[isin] ?? null;
describe("classifyExposures", () => {
	it("classifies the top-N positions via the injected lookup", () => {
		const positions = [
			pos("Alder Inc.", "US1111111005", 50000),
			pos("Cedarsoft Corp.", "US4444441045", 40000),
		];
		const out = classifyExposures(positions, lookup, 10);
		const aldr = out.find((p) => p.isin === "US1111111005")!;
		expect(aldr.sektor).toBe("technology");
		expect(aldr.region).toBe("northAmerica");
		const msft = out.find((p) => p.isin === "US4444441045")!;
		expect(msft.sektor).toBe("technology");
		expect(msft.region).toBe("northAmerica");
	});
	it("leaves an ISIN the lookup does not know as null (never guesses)", () => {
		const positions = [pos("Unknown AG", "DE000UNKNOWN0", 80000)];
		const out = classifyExposures(positions, lookup, 10);
		expect(out[0]!.sektor).toBeNull();
		expect(out[0]!.region).toBeNull();
	});
	it("classifies only the top `limit` positions by value; the tail stays null", () => {
		const positions = [
			pos("Alder Inc.", "US1111111005", 50000),
			pos("Cedarsoft Corp.", "US4444441045", 40000),
		];
		const out = classifyExposures(positions, lookup, 1);
		const aldr = out.find((p) => p.isin === "US1111111005")!;
		expect(aldr.sektor).toBe("technology");
		expect(aldr.region).toBe("northAmerica");
		const msft = out.find((p) => p.isin === "US4444441045")!;
		expect(msft.sektor).toBeNull();
		expect(msft.region).toBeNull();
	});
	it("ranks by value, not array order, when choosing the top-N", () => {
		const positions = [
			pos("Cedarsoft Corp.", "US4444441045", 40000),
			pos("Alder Inc.", "US1111111005", 50000),
		];
		const out = classifyExposures(positions, lookup, 1);
		expect(out.find((p) => p.isin === "US1111111005")!.sektor).toBe(
			"technology",
		);
		expect(out.find((p) => p.isin === "US4444441045")!.sektor).toBeNull();
	});
	it("skips positions without an ISIN (residual / unidentified rows)", () => {
		const positions = [pos("Residual WRLD", null, 90000)];
		const out = classifyExposures(positions, lookup, 10);
		expect(out[0]!.sektor).toBeNull();
		expect(out[0]!.region).toBeNull();
	});
	it("a recognized sector but unresolvable country → sektor set, region null", () => {
		const oddLookup: ProfileLookup = () => ({
			sector: "Healthcare",
			country: "Other",
		});
		const out = classifyExposures(
			[pos("Some Pharma", "US0000000003", 10000)],
			oddLookup,
			10,
		);
		expect(out[0]!.sektor).toBe("healthcare");
		expect(out[0]!.region).toBeNull();
	});
	it("does not mutate the input array or its positions; preserves order", () => {
		const positions = [
			pos("Alder Inc.", "US1111111005", 50000),
			pos("Cedarsoft Corp.", "US4444441045", 40000),
		];
		const snapshot = positions.map((p) => ({ ...p }));
		const out = classifyExposures(positions, lookup, 10);
		expect(positions).toEqual(snapshot);
		expect(out).not.toBe(positions);
		expect(out[0]).not.toBe(positions[0]);
		expect(out.map((p) => p.isin)).toEqual(["US1111111005", "US4444441045"]);
	});
});
