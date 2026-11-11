import { describe, expect, it } from "vitest";
import { evaluateIssuerConcentration } from "../../src/internal/concentration/from-lookthrough.js";
import { dissolveEtfs } from "../../src/internal/xray/dissolve.js";
import {
	fundIdentity,
	mergeEtfInputsByFund,
} from "../../src/internal/xray/fund-identity.js";
import { mergeByIdentity } from "../../src/internal/xray/merge.js";
import type { EngineEtfInput } from "../../src/internal/xray/types.js";
import { CORE, WRLD } from "./fixtures.js";
describe("fundIdentity", () => {
	it.each([
		"N/A",
		"UNKNOWN",
		"USNOTANISINX",
	])("uses ticker fallback for invalid ISIN %s", (isin) => {
		expect(fundIdentity({ isin, ticker: " wrld.de " })).toBe("ticker:WRLD.DE");
	});
	it("keys a fund by its ISIN first and by ticker only without one", () => {
		expect(fundIdentity({ isin: " iesyn6451620 ", ticker: "WRLD.DE" })).toBe(
			"isin:IESYN6451620",
		);
		expect(fundIdentity({ isin: null, ticker: " wrld.de " })).toBe(
			"ticker:WRLD.DE",
		);
	});
});
const COMPOSITE = "IE00BK5BQT80__EUR@XETR";
describe("mergeEtfInputsByFund", () => {
	it("preserves the valid fund ISIN when a ticker-matching placeholder row represents it", () => {
		const rows = [
			{ ...WRLD, isin: "UNKNOWN", ticker: "WRLD.DE", value: 100 },
			{ ...WRLD, ticker: "wrld.de", value: 200 },
		];
		const merged = mergeEtfInputsByFund(rows);
		expect(merged).toHaveLength(1);
		expect(merged[0]).toMatchObject({ value: 300, isin: WRLD.isin });
	});
	it("retains valid identity and a sibling's data gap when a placeholder row is sealed", () => {
		const sealed: EngineEtfInput = {
			...WRLD,
			isin: "UNKNOWN",
			ticker: "WRLD.DE",
			value: 100,
			constituents: [],
			sectorVector: null,
			countryVector: null,
			underlyingAssetClass: "bonds",
		};
		const gap: EngineEtfInput = {
			...sealed,
			isin: WRLD.isin,
			value: 700000,
			degraded: true,
			underlyingAssetClass: "alternatives",
		};
		for (const rows of [
			[sealed, gap],
			[gap, sealed],
		]) {
			expect(mergeEtfInputsByFund(rows)).toMatchObject([
				{ isin: WRLD.isin, value: 700100, degraded: true },
			]);
		}
	});
	it.each([
		"N/A",
		"UNKNOWN",
		"USNOTANISINX",
	])("never replaces unrelated funds' constituents through a shared invalid ISIN %s", (isin) => {
		const diversified: EngineEtfInput = {
			...WRLD,
			isin,
			ticker: "A",
			value: 500,
			constituents: Array.from({ length: 20 }, (_, index) => ({
				isin: `DE${String(index).padStart(10, "0")}`,
				name: `Issuer ${index}`,
				identifier: `ISS${index}`,
				weight: 0.05,
			})),
		};
		const concentrated: EngineEtfInput = {
			...CORE,
			isin,
			ticker: "B",
			value: 500,
			constituents: [
				{ isin: "DESYN3691660", name: "MAPLE", identifier: "MAPLE", weight: 1 },
			],
		};
		const inputs = mergeEtfInputsByFund([diversified, concentrated]);
		expect(inputs).toHaveLength(2);
		const { exposures } = dissolveEtfs(inputs);
		const result = evaluateIssuerConcentration({
			rows: mergeByIdentity([], exposures, 1000),
			capPct: 10,
		});
		expect(result.coverage).toBe(1);
		expect(result.maxIssuer?.weight).toBeCloseTo(0.5);
		expect(result.breached).toBe(true);
	});
	it("does not assign an ambiguous ticker-only row to whichever valid fund appeared first", () => {
		const a = { ...WRLD, ticker: "SAME", value: 100 };
		const b = { ...CORE, ticker: "SAME", value: 200 };
		const unknown = { ...WRLD, isin: null, ticker: "SAME", value: 50 };
		for (const rows of [
			[a, b, unknown],
			[b, unknown, a],
			[unknown, a, b],
		]) {
			const merged = mergeEtfInputsByFund([...rows, { ...unknown, value: 25 }]);
			expect(merged).toHaveLength(3);
			expect(merged.find((f) => f.isin === a.isin)?.value).toBe(100);
			expect(merged.find((f) => f.isin === b.isin)?.value).toBe(200);
			expect(merged.find((f) => f.isin === null)?.value).toBe(75);
		}
	});
	it("folds two rows of one ISIN under two ticker spellings into one input with the summed value", () => {
		const atBrokerA = { ...WRLD, ticker: "WRLD.DE", value: 60000 };
		const atBrokerB = {
			...WRLD,
			ticker: COMPOSITE,
			isin: "iesyn6451620",
			value: 40000,
		};
		const merged = mergeEtfInputsByFund([atBrokerA, atBrokerB]);
		expect(merged).toHaveLength(1);
		expect(merged[0]?.value).toBe(100000);
		expect(merged[0]?.constituents).toBe(WRLD.constituents);
	});
	it("names the fund by its shortest spelling on every compute, whatever order the rows arrive in", () => {
		const human = { ...WRLD, ticker: "WRLD.DE", value: 1 };
		const composite = { ...WRLD, ticker: COMPOSITE, value: 2 };
		for (const order of [
			[human, composite],
			[composite, human],
		]) {
			expect(mergeEtfInputsByFund(order)[0]?.ticker).toBe("WRLD.DE");
		}
	});
	it("keeps two ISINs apart even when they share a ticker spelling", () => {
		const merged = mergeEtfInputsByFund([
			{ ...WRLD, ticker: "SAME" },
			{ ...CORE, ticker: "same" },
		]);
		expect(merged).toHaveLength(2);
	});
	it("lets an ISIN-less row join the fund whose ticker it carries, in either order, without losing the ISIN", () => {
		const manual = { ...WRLD, isin: null, ticker: "wrld.de", value: 1000 };
		const imported = { ...WRLD, ticker: "WRLD.DE", value: 9000 };
		for (const order of [
			[manual, imported],
			[imported, manual],
		]) {
			const merged = mergeEtfInputsByFund(order);
			expect(merged).toHaveLength(1);
			expect(merged[0]?.value).toBe(10000);
			expect(merged[0]?.isin).toBe("IESYN6451620");
		}
	});
	it("keeps an ISIN-less row apart from a fund with a different ticker", () => {
		const merged = mergeEtfInputsByFund([
			{ ...WRLD, isin: null, ticker: "WRLD" },
			{ ...WRLD, ticker: "WRLD.DE" },
		]);
		expect(merged).toHaveLength(2);
	});
	it("represents the fund by the row that looked through, never by a degraded or empty sibling", () => {
		const degraded: EngineEtfInput = {
			...WRLD,
			ticker: COMPOSITE,
			constituents: [],
			sectorVector: null,
			countryVector: null,
			degraded: true,
			value: 30000,
		};
		const indexedEmpty: EngineEtfInput = {
			...WRLD,
			ticker: "WRLD.SW",
			constituents: [],
			value: 20000,
		};
		const clean = { ...WRLD, ticker: "WRLD.DE", value: 50000 };
		for (const order of [
			[degraded, indexedEmpty, clean],
			[indexedEmpty, clean, degraded],
			[clean, degraded, indexedEmpty],
		]) {
			const merged = mergeEtfInputsByFund(order);
			expect(merged).toHaveLength(1);
			expect(merged[0]?.degraded).not.toBe(true);
			expect(merged[0]?.constituents).toBe(WRLD.constituents);
			expect(merged[0]?.value).toBe(100000);
			expect(merged[0]?.ticker).toBe("WRLD.DE");
		}
	});
	it("ranks the row that covers most of the fund above spelling when several looked through", () => {
		const thin: EngineEtfInput = {
			...WRLD,
			ticker: "A.DE",
			value: 10,
			constituents: [
				WRLD.constituents[0] as EngineEtfInput["constituents"][number],
			],
		};
		const full = { ...WRLD, ticker: "LONGER.DE", value: 90 };
		for (const order of [
			[thin, full],
			[full, thin],
		]) {
			const merged = mergeEtfInputsByFund(order)[0];
			expect(merged?.ticker).toBe("LONGER.DE");
			expect(merged?.constituents).toBe(WRLD.constituents);
			expect(merged?.value).toBe(100);
		}
	});
	it("keeps a sibling's date, and never an empty vector or an unnormalised ISIN, on the folded fund", () => {
		const rep = {
			...WRLD,
			ticker: "A",
			isin: null,
			asOf: null,
			sectorVector: [],
			value: 1,
		};
		const twin = {
			...WRLD,
			ticker: "a",
			isin: " iesyn6451620 ",
			asOf: "2026-09-01",
			sectorVector: [{ key: "technology", weight: 1 }],
			value: 1,
		};
		const merged = mergeEtfInputsByFund([rep, twin])[0];
		expect(merged?.ticker).toBe("A");
		expect(merged?.asOf).toBe("2026-09-01");
		expect(merged?.sectorVector).toBe(twin.sectorVector);
		expect(merged?.isin).toBe("IESYN6451620");
	});
	it("names the fund by a sealed row's clean empty answer but keeps the fund pending while a sibling is an outage", () => {
		const outage: EngineEtfInput = {
			...WRLD,
			ticker: "A.DE",
			constituents: [],
			degraded: true,
			asOf: null,
		};
		const sealed: EngineEtfInput = {
			...WRLD,
			ticker: "B.DE",
			constituents: [],
			asOf: null,
		};
		const merged = mergeEtfInputsByFund([outage, sealed]);
		expect(merged[0]?.ticker).toBe("B.DE");
		expect(merged[0]?.degraded).toBe(true);
	});
	it("keeps a fund pending when a vouched-sealed row shares its ISIN with a data gap", () => {
		const gap: EngineEtfInput = {
			...WRLD,
			ticker: "REIT.DE",
			isin: "IESYN2749370",
			value: 700000,
			constituents: [],
			underlyingAssetClass: "alternatives",
			degraded: true,
			asOf: null,
		};
		const vouched: EngineEtfInput = {
			...WRLD,
			ticker: "BND.DE",
			isin: "IESYN2749370",
			value: 1000,
			constituents: [],
			underlyingAssetClass: "bonds",
			asOf: null,
		};
		const merged = mergeEtfInputsByFund([gap, vouched]);
		expect(merged).toHaveLength(1);
		expect(merged[0]?.value).toBe(701000);
		expect(merged[0]?.degraded).toBe(true);
	});
	it("lets a row that genuinely looked through carry the fund, outage sibling and all", () => {
		const outage: EngineEtfInput = {
			...WRLD,
			ticker: "A.DE",
			value: 500000,
			constituents: [],
			degraded: true,
			asOf: null,
		};
		const resolved: EngineEtfInput = { ...WRLD, ticker: "B.DE", value: 2000 };
		const merged = mergeEtfInputsByFund([outage, resolved]);
		expect(merged[0]?.value).toBe(502000);
		expect(merged[0]?.constituents).toBe(WRLD.constituents);
		expect(merged[0]?.degraded).toBe(false);
	});
	it("keeps a sibling's vectors and underlying class when the representative has none", () => {
		const resolved = {
			...WRLD,
			ticker: "WRLD.DE",
			sectorVector: null,
			countryVector: null,
			underlyingAssetClass: null,
			value: 1,
		};
		const twin = {
			...WRLD,
			ticker: COMPOSITE,
			sectorVector: [{ key: "technology", weight: 1 }],
			countryVector: [{ key: "US", weight: 1 }],
			underlyingAssetClass: "equities",
			value: 1,
		};
		const merged = mergeEtfInputsByFund([resolved, twin]);
		expect(merged[0]?.ticker).toBe("WRLD.DE");
		expect(merged[0]?.sectorVector).toBe(twin.sectorVector);
		expect(merged[0]?.countryVector).toBe(twin.countryVector);
		expect(merged[0]?.underlyingAssetClass).toBe("equities");
	});
	it("preserves first-occurrence order and passes a lone row through by reference", () => {
		const merged = mergeEtfInputsByFund([
			CORE,
			{ ...WRLD, isin: null, ticker: "wrld.de" },
			WRLD,
		]);
		expect(merged.map((m) => m.isin)).toEqual([CORE.isin, WRLD.isin]);
		expect(merged[0]).toBe(CORE);
	});
});
