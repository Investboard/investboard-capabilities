import { describe, expect, it } from "vitest";
import { groupByIssuer } from "../../src/internal/xray/group-by-issuer.js";
import type { MergedPosition } from "../../src/internal/xray/types.js";
function pos(over: Partial<MergedPosition>): MergedPosition {
	return {
		id: "isin:US1111111005",
		isin: "US1111111005",
		ticker: "ALDR",
		name: "Alder Inc.",
		value: 1000,
		weight: 0.1,
		assetClass: "equities",
		sektor: null,
		region: null,
		provenance: { direct: 0.1, viaFunds: [] },
		...over,
	};
}
const ALPN = pos({
	id: "isin:US2222223059",
	isin: "US2222223059",
	ticker: "ALPN",
	name: "Alphanumeric Inc. Class A",
	value: 1800,
	weight: 0.018,
});
const ALPC = pos({
	id: "isin:US2222221079",
	isin: "US2222221079",
	ticker: "ALPC",
	name: "Alphanumeric Inc. Class C",
	value: 1600,
	weight: 0.016,
});
describe("groupByIssuer", () => {
	it("excludes an ETF residual remainder from the issuer-groups list (IOB-2)", () => {
		const groups = groupByIssuer([
			pos({
				id: "isin:US1111111005",
				name: "Alder Inc.",
				value: 1000,
				weight: 0.1,
			}),
			pos({
				id: "residual:CORE",
				isin: null,
				ticker: null,
				name: "Synthetic Core World",
				value: 5000,
				weight: 0.5,
			}),
		]);
		expect(groups.some((g) => g.key.startsWith("residual:"))).toBe(false);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.name).toBe("Alder Inc.");
	});
	it("groups ALPN + ALPC into one Alphanumeric issuer, summing value/weight", () => {
		const groups = groupByIssuer([ALPN, ALPC]);
		const alphanumeric = groups.find((g) => g.key === "cusip6:222222")!;
		expect(alphanumeric).toBeDefined();
		expect(alphanumeric.grouped).toBe(true);
		expect(alphanumeric.value).toBeCloseTo(3400, 2);
		expect(alphanumeric.weight).toBeCloseTo(0.034, 4);
		expect(alphanumeric.breakdown.map((p) => p.ticker)).toEqual([
			"ALPN",
			"ALPC",
		]);
		expect(alphanumeric.name).toBe("Alphanumeric Inc. Class A");
	});
	it("keeps a non-US ISIN line whose name does not group separate (its own group)", () => {
		const pinecrest = pos({
			id: "isin:CHSYN1607080",
			isin: "CHSYN1607080",
			ticker: "PNCR",
			name: "Pinecrest SA",
			value: 900,
			weight: 0.009,
		});
		const groups = groupByIssuer([ALPN, ALPC, pinecrest]);
		const own = groups.find((g) => g.key === "issuer-name:pinecrest")!;
		expect(own).toBeDefined();
		expect(own.grouped).toBe(false);
		expect(own.breakdown).toHaveLength(1);
	});
	it("groups two non-US same-issuer lines (a DE equity + a DE bond) into one issuer", () => {
		const mapleEquity = pos({
			id: "isin:DESYN3691660",
			isin: "DESYN3691660",
			ticker: "MAPLE",
			name: "MAPLE SE",
			value: 2000,
			weight: 0.02,
		});
		const mapleBond = pos({
			id: "isin:XS1234567890",
			isin: "XS1234567890",
			ticker: null,
			name: "MAPLE SE 1.0% 2029",
			value: 1000,
			weight: 0.01,
		});
		const groups = groupByIssuer([mapleEquity, mapleBond]);
		const maple = groups.find((g) => g.key === "issuer-name:maple")!;
		expect(maple).toBeDefined();
		expect(maple.grouped).toBe(true);
		expect(maple.value).toBeCloseTo(3000, 2);
		expect(maple.weight).toBeCloseTo(0.03, 4);
		expect(maple.breakdown).toHaveLength(1 + 1);
		expect(groups).toHaveLength(1);
	});
	it("keys a ticker-only named position on its normalized name (single group)", () => {
		const tickerOnly = pos({
			id: "ticker:HLS.B",
			isin: null,
			ticker: "HLS.B",
			name: "Hillside Harbor B",
			value: 500,
			weight: 0.005,
		});
		const groups = groupByIssuer([tickerOnly]);
		expect(groups[0]!.key).toBe("issuer-name:hillside harbor b");
		expect(groups[0]!.grouped).toBe(false);
	});
	it("falls back to the position id when a line has no ISIN and no normalizable name", () => {
		const unnamed = pos({
			id: "ticker:XYZ",
			isin: null,
			ticker: "XYZ",
			name: "",
			value: 500,
			weight: 0.005,
		});
		const groups = groupByIssuer([unnamed]);
		expect(groups[0]!.key).toBe("ticker:XYZ");
		expect(groups[0]!.grouped).toBe(false);
	});
	it("leaves a US single-class issuer unaffected (own group, grouped=false)", () => {
		const groups = groupByIssuer([pos({})]);
		expect(groups).toHaveLength(1);
		expect(groups[0]!.grouped).toBe(false);
		expect(groups[0]!.key).toBe("cusip6:111111");
		expect(groups[0]!.breakdown).toHaveLength(1);
	});
	it("sorts groups by summed weight descending", () => {
		const small = pos({
			id: "isin:US4444441045",
			isin: "US4444441045",
			ticker: "CDSF",
			name: "Cedarsoft Corp.",
			value: 200,
			weight: 0.002,
		});
		const groups = groupByIssuer([small, ALPN, ALPC]);
		expect(groups[0]!.key).toBe("cusip6:222222");
		for (let i = 1; i < groups.length; i++) {
			expect(groups[i - 1]!.weight).toBeGreaterThanOrEqual(groups[i]!.weight);
		}
	});
});
