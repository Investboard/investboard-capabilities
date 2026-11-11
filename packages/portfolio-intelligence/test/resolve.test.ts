import { describe, expect, it } from "vitest";
import {
	resolveFundInput,
	type ValuedHolding,
} from "../src/internal/resolve/fund-input.js";
import {
	classifyDirectHolding,
	profileMap,
	toEngineDirectHoldings,
} from "../src/internal/resolve/security-profile.js";
import type { FundInput, FundOverride } from "../src/types.js";

const NO_OVERRIDES: ReadonlyMap<string, FundOverride> = new Map();

function fundHolding(overrides: Partial<ValuedHolding> = {}): ValuedHolding {
	return {
		id: "world",
		kind: "fund",
		name: "Synthetic World Fund",
		isin: "IE0000000011",
		ticker: "WRLD",
		value: 1000,
		listingCurrency: "EUR",
		assetClass: "equities",
		...overrides,
	};
}

const LISTED: FundInput["holdings"] = {
	status: "listed",
	asOf: "2026-09-30",
	constituents: [
		{ id: "ALDR", isin: "us1111110005 ", name: "Alder Inc.", weight: 0.4 },
		{ id: "CDSF", isin: null, name: "Cedarsoft Corp.", weight: 0.3 },
	],
};

function fund(overrides: Partial<FundInput> = {}): FundInput {
	return { holdingId: "world", holdings: LISTED, ...overrides };
}

describe("resolveFundInput: the app's fund matrix on caller input", () => {
	it("holds a fund whole in the override class when the override says held whole", () => {
		const overrides = new Map([
			[
				"IE0000000011",
				{
					isin: "IE0000000011",
					assetClass: "commodities",
					heldWhole: true,
				} satisfies FundOverride,
			],
		]);
		const input = resolveFundInput(fundHolding(), fund(), overrides);
		expect(input.constituents).toHaveLength(0);
		expect(input.underlyingAssetClass).toBe("commodities");
		expect(input.heldWholeAs).toBe("commodities");
		expect(input.degraded).toBeFalsy();
	});

	it("uses a reviewed override class and otherwise resolves normally", () => {
		const overrides = new Map([
			[
				"IE0000000011",
				{
					isin: "IE0000000011",
					assetClass: "bonds",
					heldWhole: false,
				} satisfies FundOverride,
			],
		]);
		const input = resolveFundInput(fundHolding(), fund(), overrides);
		expect(input.constituents).toHaveLength(0);
		expect(input.underlyingAssetClass).toBe("bonds");
		expect(input.heldWholeAs ?? null).toBeNull();
	});

	it("holds a stated bond fund whole and never reads its list", () => {
		const input = resolveFundInput(
			fundHolding({ assetClass: "bonds" }),
			fund(),
			NO_OVERRIDES,
		);
		expect(input.constituents).toHaveLength(0);
		expect(input.underlyingAssetClass).toBe("bonds");
		expect(input.degraded).toBeFalsy();
		expect(input.sectorVector ?? null).toBeNull();
	});

	for (const assetClass of ["cash", "gold", "crypto"] as const) {
		it(`holds a stated ${assetClass} fund whole`, () => {
			const input = resolveFundInput(
				fundHolding({ assetClass }),
				fund(),
				NO_OVERRIDES,
			);
			expect(input.constituents).toHaveLength(0);
			expect(input.underlyingAssetClass).toBe(assetClass);
		});
	}

	it("marks a fund with a missing list as pending", () => {
		const input = resolveFundInput(
			fundHolding(),
			fund({ holdings: { status: "missing" } }),
			NO_OVERRIDES,
		);
		expect(input.constituents).toHaveLength(0);
		expect(input.degraded).toBe(true);
		expect(input.underlyingAssetClass).toBe("equities");
		expect(input.indexRead).toBeUndefined();
	});

	it("marks a fund with no fund input as pending", () => {
		const input = resolveFundInput(fundHolding(), undefined, NO_OVERRIDES);
		expect(input.degraded).toBe(true);
		expect(input.constituents).toHaveLength(0);
	});

	it("reads a fund with a missing list through its index and discloses it", () => {
		const input = resolveFundInput(
			fundHolding(),
			fund({
				holdings: { status: "missing" },
				readThrough: {
					index: "Synthetic All Country Index",
					fundName: "Synthetic Index Tracker",
					asOf: "2026-09-30",
					constituents: [
						{
							id: "ALDR",
							isin: "US1111110005",
							name: "Alder Inc.",
							weight: 0.5,
						},
					],
				},
			}),
			NO_OVERRIDES,
		);
		expect(input.degraded).toBeFalsy();
		expect(input.constituents.map((c) => c.isin)).toEqual(["US1111110005"]);
		expect(input.indexRead).toEqual({
			index: "Synthetic All Country Index",
			fund: "Synthetic Index Tracker",
		});
		expect(input.asOf).toBe("2026-09-30");
		expect(input.value).toBe(1000);
	});

	it("keeps a fund's own listed constituents over a read-through", () => {
		const input = resolveFundInput(
			fundHolding(),
			fund({
				readThrough: {
					index: "Synthetic All Country Index",
					fundName: "Synthetic Index Tracker",
					asOf: "2026-09-30",
					constituents: [
						{ id: "OTHER", isin: "US9999990009", name: "Other", weight: 1 },
					],
				},
			}),
			NO_OVERRIDES,
		);
		expect(input.indexRead).toBeUndefined();
		expect(input.constituents.map((c) => c.identifier)).toEqual([
			"ALDR",
			"CDSF",
		]);
	});

	it("holds a fund that reports no constituents whole without marking it pending", () => {
		const input = resolveFundInput(
			fundHolding(),
			fund({
				holdings: { status: "none_reported" },
				sectorBreakdown: [{ key: "Technology", weight: 0.6 }],
			}),
			NO_OVERRIDES,
		);
		expect(input.constituents).toHaveLength(0);
		expect(input.degraded).toBeFalsy();
		expect(input.sectorVector).toEqual([{ key: "technology", weight: 0.6 }]);
	});

	it("holds an equities fund whose reported class is bonds whole as bonds", () => {
		const input = resolveFundInput(
			fundHolding(),
			fund({ reportedClass: "bonds" }),
			NO_OVERRIDES,
		);
		expect(input.constituents).toHaveLength(0);
		expect(input.underlyingAssetClass).toBe("bonds");
	});

	it("reads a reported real-estate class as equities, like the app reads a Real Estate label", () => {
		const input = resolveFundInput(
			fundHolding(),
			fund({ reportedClass: "real_estate" }),
			NO_OVERRIDES,
		);
		expect(input.underlyingAssetClass).toBe("equities");
		expect(input.constituents).toHaveLength(2);
	});

	it("keeps a stated real-estate class over a reported equities class", () => {
		const input = resolveFundInput(
			fundHolding({ assetClass: "real_estate" }),
			fund({ reportedClass: "equities" }),
			NO_OVERRIDES,
		);
		expect(input.underlyingAssetClass).toBe("real_estate");
		expect(input.constituents).toHaveLength(2);
	});

	it("looks through a listed equity fund with its constituents and breakdowns", () => {
		const input = resolveFundInput(
			fundHolding(),
			fund({
				sectorBreakdown: [
					{ key: "Technology", weight: 0.5 },
					{ key: "Not a sector", weight: 0.1 },
				],
				countryBreakdown: [{ key: "United States", weight: 0.7 }],
			}),
			NO_OVERRIDES,
		);
		expect(input.constituents).toEqual([
			{
				identifier: "ALDR",
				isin: "US1111110005",
				name: "Alder Inc.",
				weight: 0.4,
			},
			{ identifier: "CDSF", isin: null, name: "Cedarsoft Corp.", weight: 0.3 },
		]);
		expect(input.sectorVector).toEqual([{ key: "technology", weight: 0.5 }]);
		expect(input.countryVector).toEqual([{ key: "US", weight: 0.7 }]);
		expect(input.asOf).toBe("2026-09-30");
		expect(input.underlyingAssetClass).toBe("equities");
		expect(input.ticker).toBe("WRLD");
	});

	it("uses the holding id as the fund key when it has no ticker", () => {
		const input = resolveFundInput(
			fundHolding({ ticker: null }),
			fund(),
			NO_OVERRIDES,
		);
		expect(input.ticker).toBe("world");
	});
});

describe("security profiles", () => {
	const profiles = profileMap([
		{
			isin: "US1111110005",
			sector: "Technology",
			country: "United States",
			assetClass: "equities",
		},
		{
			isin: "IE0000000011",
			sector: "Financial Services",
			country: "Ireland",
			assetClass: null,
		},
	]);

	it("classifies a direct equity from its profile", () => {
		expect(
			classifyDirectHolding(
				{ isin: "US1111110005", assetClass: "equities" },
				profiles,
			),
		).toEqual({
			sector: "technology",
			country: "US",
		});
	});

	it("ignores a fund's own profile for a direct holding", () => {
		expect(
			classifyDirectHolding(
				{ isin: "IE0000000011", assetClass: "equities" },
				profiles,
			),
		).toEqual({
			sector: null,
			country: null,
		});
	});

	it("gives a non-equity holding no sector or country", () => {
		expect(
			classifyDirectHolding(
				{ isin: "US1111110005", assetClass: "gold" },
				profiles,
			),
		).toEqual({
			sector: null,
			country: null,
		});
	});

	it("turns direct holdings into engine holdings with normalised classes", () => {
		const direct = toEngineDirectHoldings(
			[
				{
					id: "alder",
					kind: "security",
					name: "Alder Inc.",
					isin: "US1111110005",
					value: 300,
					listingCurrency: "USD",
					assetClass: "equities",
				},
				{
					id: "cash",
					kind: "cash",
					name: "Cash",
					value: 100,
					listingCurrency: "EUR",
					assetClass: "cash",
				},
				{
					id: "mystery",
					kind: "security",
					name: "Mystery",
					value: 50,
					listingCurrency: "EUR",
					assetClass: "unknown",
				},
			],
			profiles,
		);
		expect(direct).toEqual([
			{
				ticker: "alder",
				isin: "US1111110005",
				name: "Alder Inc.",
				value: 300,
				assetClass: "equities",
				sector: "technology",
				country: "US",
			},
			{
				ticker: "cash",
				isin: null,
				name: "Cash",
				value: 100,
				assetClass: "cash",
				sector: null,
				country: null,
			},
			{
				ticker: "mystery",
				isin: null,
				name: "Mystery",
				value: 50,
				assetClass: "unknown",
				sector: null,
				country: null,
			},
		]);
	});
});
