import { describe, expect, it } from "vitest";
import {
	evaluateIssuerConcentration,
	type LookThroughRowLike,
} from "../../src/internal/concentration/from-lookthrough.js";
const CEDARSOFT_ISIN = "US4444441045";
const ALDER_ISIN = "US1111111005";
const MAPLE_ISIN = "DESYN3691660";
const row = (
	r: Partial<LookThroughRowLike> &
		Pick<LookThroughRowLike, "id" | "name" | "value">,
): LookThroughRowLike => ({
	isin: null,
	assetClass: "equities",
	...r,
});
const CROSS_FUND_BOOK: LookThroughRowLike[] = [
	row({
		id: "isin:US4444441045",
		isin: CEDARSOFT_ISIN,
		name: "Cedarsoft Corp",
		value: 60,
	}),
	row({
		id: "isin:US4444441045",
		isin: CEDARSOFT_ISIN,
		name: "Cedarsoft Corporation",
		value: 90,
	}),
	row({
		id: "isin:US4444441045",
		isin: CEDARSOFT_ISIN,
		name: "CEDARSOFT CORP",
		value: 50,
	}),
	row({
		id: "isin:US1111111005",
		isin: ALDER_ISIN,
		name: "Alder Inc.",
		value: 120,
	}),
	row({
		id: "isin:DESYN3691660",
		isin: MAPLE_ISIN,
		name: "MAPLE SE",
		value: 80,
	}),
	row({ id: "residual:CORE", name: "Synthetic Core World", value: 400 }),
	row({ id: "residual:WRLD", name: "Synthetic All-World", value: 200 }),
];
describe("convention: single-issuer concentration is look-through equity exposure over the equity book", () => {
	it("sums one company held directly AND inside two funds into a single issuer", () => {
		const result = evaluateIssuerConcentration({
			rows: CROSS_FUND_BOOK,
			capPct: 10,
		});
		const cedarsoft = result.issuers.find((i) =>
			i.issuerName.toLowerCase().startsWith("cedarsoft"),
		);
		expect(cedarsoft?.weight).toBeCloseTo(0.2, 10);
		expect(result.maxIssuer?.weight).toBeCloseTo(0.2, 10);
		expect(result.breached).toBe(true);
	});
	it("never ranks a fund as an issuer", () => {
		const result = evaluateIssuerConcentration({
			rows: CROSS_FUND_BOOK,
			capPct: 10,
		});
		expect(result.issuers.some((i) => i.issuerId.startsWith("residual:"))).toBe(
			false,
		);
		expect(result.issuers.some((i) => /synthetic/i.test(i.issuerName))).toBe(
			false,
		);
		expect(result.coverage).toBeCloseTo(0.4, 10);
	});
	it("keeps the fund remainder in the denominator, so weights never sum above 1", () => {
		const result = evaluateIssuerConcentration({
			rows: CROSS_FUND_BOOK,
			capPct: 10,
		});
		const total = result.issuers.reduce((sum, i) => sum + i.weight, 0);
		expect(total).toBeCloseTo(0.4, 10);
		expect(total).toBeLessThanOrEqual(1);
	});
	it("excludes cash, bonds and physical assets from both sides", () => {
		const withBallast = evaluateIssuerConcentration({
			rows: [
				...CROSS_FUND_BOOK,
				row({
					id: "ticker:EUR",
					name: "Liquidität",
					value: 5000,
					assetClass: "cash",
				}),
				row({
					id: "ticker:4GLD",
					name: "Xetra-Gold",
					value: 5000,
					assetClass: "gold",
				}),
				row({
					id: "residual:IBCS",
					name: "Synthetic Euro Corporate Bond",
					value: 5000,
					assetClass: "bonds",
				}),
			],
			capPct: 10,
		});
		const bare = evaluateIssuerConcentration({
			rows: CROSS_FUND_BOOK,
			capPct: 10,
		});
		expect(withBallast.maxIssuer?.weight).toBeCloseTo(
			bare.maxIssuer?.weight ?? Number.NaN,
			10,
		);
		expect(withBallast.coverage).toBeCloseTo(bare.coverage, 10);
	});
	it("resolves one issuer across differing name spellings via the shared issuer key", () => {
		const result = evaluateIssuerConcentration({
			rows: CROSS_FUND_BOOK,
			capPct: 10,
		});
		const cedarsoftRows = result.issuers.filter((i) =>
			i.issuerName.toLowerCase().startsWith("cedarsoft"),
		);
		expect(cedarsoftRows).toHaveLength(1);
	});
	it("treats a measured breach as certain even when most of the book is unattributed", () => {
		const result = evaluateIssuerConcentration({
			rows: [
				row({
					id: "isin:DESYN3691660",
					isin: MAPLE_ISIN,
					name: "MAPLE SE",
					value: 150,
				}),
				row({
					id: "residual:CORE",
					name: "Synthetic Core World",
					value: 850,
				}),
			],
			capPct: 10,
		});
		expect(result.coverage).toBeCloseTo(0.15, 10);
		expect(result.breached).toBe(true);
		expect(result.refusal).toBeNull();
		expect(result.maxIssuer?.weight).toBeCloseTo(0.15, 10);
	});
	it("still refuses to call a thinly-attributed book on plan", () => {
		const result = evaluateIssuerConcentration({
			rows: [
				row({
					id: "isin:DESYN3691660",
					isin: MAPLE_ISIN,
					name: "MAPLE SE",
					value: 50,
				}),
				row({
					id: "residual:CORE",
					name: "Synthetic Core World",
					value: 950,
				}),
			],
			capPct: 10,
		});
		expect(result.refusal).toBe("coverage_below_floor");
		expect(result.maxIssuer).toBeNull();
		expect(result.breached).toBe(false);
	});
	it("reports an empty book as empty, not as a coverage failure", () => {
		const result = evaluateIssuerConcentration({
			rows: [
				row({
					id: "ticker:EUR",
					name: "Liquidität",
					value: 1000,
					assetClass: "cash",
				}),
			],
			capPct: 10,
		});
		expect(result.refusal).toBe("empty_book");
	});
});
describe("unlisted in-book value dilutes the single-issuer line", () => {
	const DUST_ROWS = 9900;
	const DUST_VALUE = 1.5;
	const DUST_TOTAL = DUST_ROWS * DUST_VALUE;
	const ACME_VALUE = 4257;
	const CAP_PCT = 5;
	const LISTED: LookThroughRowLike[] = [
		row({ id: "ticker:ACME", name: "ACME Industries", value: ACME_VALUE }),
		...Array.from({ length: 99 }, (_, i) =>
			row({ id: `ticker:OTHER${i}`, name: `Other o${i}`, value: 807 }),
		),
	];
	const DUST: LookThroughRowLike[] = Array.from({ length: DUST_ROWS }, (_, i) =>
		row({ id: `ticker:DUST${i}`, name: `Dust d${i}`, value: DUST_VALUE }),
	);
	const unlistedValueByClass = { equities: DUST_TOTAL };
	it("weighs a floored list plus its dropped mass exactly like the full list", () => {
		const full = evaluateIssuerConcentration({
			rows: [...LISTED, ...DUST],
			capPct: CAP_PCT,
		});
		const restored = evaluateIssuerConcentration({
			rows: LISTED,
			capPct: CAP_PCT,
			unlistedValueByClass,
		});
		expect(restored.maxIssuer?.issuerName).toBe("ACME Industries");
		expect(restored.maxIssuer?.weight).toBeCloseTo(
			full.maxIssuer?.weight ?? Number.NaN,
			9,
		);
		expect(restored.maxIssuer?.weight).toBeCloseTo(0.043, 6);
		expect(restored.equityBookValue).toBeCloseTo(full.equityBookValue, 6);
		expect(restored.breached).toBe(false);
		expect(restored.coverage).toBeCloseTo(0.85, 6);
		expect(full.coverage).toBeCloseTo(1, 6);
	});
	it("inflates the line into a false breach when the dropped mass is withheld", () => {
		const full = evaluateIssuerConcentration({
			rows: [...LISTED, ...DUST],
			capPct: CAP_PCT,
		});
		const withheld = evaluateIssuerConcentration({
			rows: LISTED,
			capPct: CAP_PCT,
		});
		expect(withheld.maxIssuer?.weight).toBeCloseTo(
			(full.maxIssuer?.weight ?? Number.NaN) / (1 - 0.15),
			9,
		);
		expect(withheld.maxIssuer?.weight).toBeCloseTo(0.0506, 4);
		expect(withheld.breached).toBe(true);
	});
	it("counts only the EQUITY classes of the dropped mass", () => {
		const equityOnly = evaluateIssuerConcentration({
			rows: LISTED,
			capPct: CAP_PCT,
			unlistedValueByClass,
		});
		const withOtherClasses = evaluateIssuerConcentration({
			rows: LISTED,
			capPct: CAP_PCT,
			unlistedValueByClass: {
				...unlistedValueByClass,
				bonds: 50000,
				cash: 25000,
			},
		});
		expect(withOtherClasses.equityBookValue).toBeCloseTo(
			equityOnly.equityBookValue,
			6,
		);
		expect(withOtherClasses.maxIssuer?.weight).toBeCloseTo(
			equityOnly.maxIssuer?.weight ?? Number.NaN,
			9,
		);
	});
});
