import type {
	EngineDirectHolding,
	EngineEtfInput,
} from "../../src/internal/xray/types.js";
export const WRLD: EngineEtfInput = {
	ticker: "WRLD.DE",
	isin: "IESYN6451620",
	name: "Synthetic All-World UCITS ETF",
	value: 50000,
	underlyingAssetClass: "equities",
	asOf: "2026-06-08",
	constituents: [
		{
			identifier: "ALDR",
			isin: "US1111111005",
			name: "Alder Inc.",
			weight: 0.039,
		},
		{
			identifier: "CDSF",
			isin: "US4444441045",
			name: "Cedarsoft Corp.",
			weight: 0.037,
		},
		{
			identifier: "ELMT",
			isin: "US5555551040",
			name: "ELMTRON Corp.",
			weight: 0.031,
		},
		{
			identifier: "RVMT",
			isin: "US3333331067",
			name: "Rivermart.com Inc.",
			weight: 0.021,
		},
	],
};
export const CORE: EngineEtfInput = {
	ticker: "CORE.DE",
	isin: "IESYN4303130",
	name: "Synthetic Core World UCITS ETF",
	value: 30000,
	underlyingAssetClass: "equities",
	asOf: "2026-06-09",
	constituents: [
		{
			identifier: "ALDR",
			isin: "US1111111005",
			name: "Alder Inc.",
			weight: 0.046,
		},
		{
			identifier: "CDSF",
			isin: "US4444441045",
			name: "Cedarsoft Corp.",
			weight: 0.043,
		},
		{
			identifier: "ELMT",
			isin: "US5555551040",
			name: "ELMTRON Corp.",
			weight: 0.037,
		},
	],
};
export const FULLY_COVERED_ETF: EngineEtfInput = {
	ticker: "TINY.DE",
	isin: null,
	name: "Tiny Two-Stock ETF",
	value: 1000,
	underlyingAssetClass: "equities",
	asOf: null,
	constituents: [
		{ identifier: "AAA", isin: "US0000000001", name: "Alpha AG", weight: 0.6 },
		{ identifier: "BBB", isin: "US0000000002", name: "Beta AG", weight: 0.4 },
	],
};
export const NEARLY_FULLY_COVERED_ETF: EngineEtfInput = {
	ticker: "NEAR.DE",
	isin: null,
	name: "Nearly Full ETF",
	value: 100000,
	underlyingAssetClass: "equities",
	asOf: null,
	constituents: [
		{ identifier: "AAA", isin: "US0000000001", name: "Alpha AG", weight: 0.6 },
		{ identifier: "BBB", isin: "US0000000002", name: "Beta AG", weight: 0.39 },
	],
};
export const UNRESOLVED_ETF: EngineEtfInput = {
	ticker: "DARK.DE",
	isin: null,
	name: "Undissolvable ETF",
	value: 5000,
	underlyingAssetClass: "bonds",
	asOf: null,
	constituents: [],
};
export const DIRECT_AAPL: EngineDirectHolding = {
	ticker: "ALDR",
	isin: "US1111111005",
	name: "Alder Inc.",
	value: 10000,
	assetClass: "equities",
};
export const DIRECT_GOLD: EngineDirectHolding = {
	ticker: "XAU",
	isin: null,
	name: "Physical Gold",
	value: 5000,
	assetClass: "gold",
};
