/** Authored for RA-05; UNRUN under the founder's no-execution constraint. */
import { describe, expect, it } from "vitest";
import { analyzePortfolio, PortfolioInputError, replayPortfolioAnalysis } from "../src/index.js";
import type { HoldingCurrencyEvidence, PortfolioRequest } from "../src/index.js";
import { BUILT_IN_SCENARIOS, evaluateStressScenario, StressInputError } from "../../stress-test/src/index.js";
import type { StressHoldingInput } from "../../stress-test/src/index.js";

const source = { reference: "synthetic:exact-security-policy", asOf: "2026-09-30" };
const unhedged = { basis: "reported_hedge_policy", status: "unhedged", source } as const;
const exposure = (buckets = [{ key: "JPY", weight: 1 }]) => ({
	basis: "reported_economic_exposure" as const, source, buckets,
});
function request(evidence?: HoldingCurrencyEvidence): PortfolioRequest {
	return {
		asOf: "2026-11-12", baseCurrency: "EUR",
		holdings: [
			{ id: "share", kind: "security", name: "Synthetic company", isin: "US1111110005", value: 60, listingCurrency: "EUR", assetClass: "equities", currencyEvidence: evidence },
			{ id: "cash", kind: "cash", name: "Cash", value: 40, listingCurrency: "EUR", assetClass: "cash" },
		],
		securities: [{ isin: "US1111110005", country: "US", sector: "Technology", assetClass: "equities" }],
	};
}

describe("currency evidence contract (UNRUN)", () => {
	it("keeps denomination, geography estimate and reported economic exposure separate", () => {
		const result = analyzePortfolio(request({ exposure: exposure(), hedge: unhedged }));
		expect(result.dimensions.listingCurrency.buckets[0]?.key).toBe("EUR");
		expect(result.dimensions.listingCurrency.qualification.basis).toBe("caller_supplied_listing_denomination");
		const proxy = result.dimensions.economicCurrency;
		expect(proxy.buckets[0]).toEqual({ key: "USD", value: 60, weight: 0.6 });
		expect(proxy.qualification).toMatchObject({ independentlyVerified: false, stressUse: "ineligible", hedgePolicy: "not_verified", hedgeRatio: null });
		const reported = result.dimensions.reportedEconomicCurrency;
		expect(reported.buckets).toEqual([{ key: "JPY", value: 60, weight: 0.6 }]);
		expect(reported.coverage).toBe(1);
		expect(reported.equityValue).toBe(60);
		expect(reported.byHolding[0]?.stressHandoff).toBe("independent_verification_required");
		expect(reported.byHolding[0]?.evidence?.exposure?.source).toEqual(source);
	});

	it("preserves a source-reported zero and leaves the unreported remainder unknown", () => {
		const result = analyzePortfolio(request({ exposure: exposure([{ key: "EUR", weight: 0 }, { key: "USD", weight: 0.25 }]), hedge: unhedged }));
		const reported = result.dimensions.reportedEconomicCurrency;
		expect(reported.status).toBe("partial");
		expect(reported.coverage).toBe(0.25);
		expect(reported.unknownValue).toBe(45);
		expect(reported.buckets).toContainEqual({ key: "EUR", value: 0, weight: 0 });
		expect(reported.buckets.at(-1)).toEqual({ key: "unknown", value: 45, weight: 0.45 });
		expect(reported.byHolding[0]?.stressHandoff).toBe("unavailable");
	});

	for (const status of ["partial", "unknown"] as const) {
		it(`withholds net exposure for a ${status} policy even with underlying evidence`, () => {
			const reported = analyzePortfolio(request({ exposure: exposure(), hedge: { basis: "reported_hedge_policy", status, source } })).dimensions.reportedEconomicCurrency;
			expect(reported.status).toBe("unavailable");
			expect(reported.coverage).toBe(0);
			expect(reported.unknownValue).toBe(60);
			expect(reported.byHolding[0]?.evidence?.exposure?.buckets).toEqual([{ key: "JPY", weight: 1 }]);
		});
	}

	it("does not assume a missing policy is unhedged", () => {
		const reported = analyzePortfolio(request({ exposure: exposure() })).dimensions.reportedEconomicCurrency;
		expect(reported.byHolding[0]?.reasonCodes).toContain("hedge_policy_missing");
		expect(reported.unknownValue).toBe(60);
	});

	it("models an explicitly sourced full target without claiming measured hedge effectiveness", () => {
		const reported = analyzePortfolio(request({ hedge: { basis: "reported_hedge_policy", status: "full", targetCurrency: "CHF", source } })).dimensions.reportedEconomicCurrency;
		expect(reported.buckets).toEqual([{ key: "CHF", value: 60, weight: 0.6 }]);
		expect(reported.independentlyVerified).toBe(false);
		expect(reported.byHolding[0]?.method).toBe("source_backed_full_hedge_model");
	});

	for (const name of ["World EUR Hedged", "World Currency Hedged", "World EUR Hedged 50%", "World EUR Hedged USD Hedged"]) {
		it(`keeps the name-only hint unverified: ${name}`, () => {
			const input = request();
			input.holdings[0] = { ...input.holdings[0]!, kind: "fund", name };
			input.funds = [{ holdingId: "share", holdings: { status: "none_reported" }, countryBreakdown: [{ key: "US", weight: 1 }] }];
			const dims = analyzePortfolio(input).dimensions;
			expect(dims.economicCurrency.qualification.stressUse).toBe("ineligible");
			expect(dims.economicCurrency.qualification.hedgeRatio).toBeNull();
			expect(dims.reportedEconomicCurrency.status).toBe("unavailable");
			expect(dims.economicCurrency.nameInferredHedges[0]?.sourceAsOf).toBeNull();
		});
	}

	it("does not pool source evidence across duplicate fund identities or unvalued holdings", () => {
		const input = request({ exposure: exposure(), hedge: unhedged });
		input.holdings[0]!.kind = "fund";
		input.holdings.push({ ...input.holdings[0]!, id: "same-isin-no-evidence", value: 20, currencyEvidence: undefined });
		input.holdings.push({ ...input.holdings[0]!, id: "unvalued", value: null });
		const reported = analyzePortfolio(input).dimensions.reportedEconomicCurrency;
		expect(reported.equityValue).toBe(80);
		expect(reported.coverage).toBe(0.75);
		expect(reported.byHolding.map((h) => h.holdingId)).toEqual(["share", "same-isin-no-evidence"]);
	});

	it("keeps off-axis values outside the source-backed equity denominator", () => {
		const input = request({ exposure: exposure(), hedge: unhedged });
		input.holdings[0]!.assetClass = "bonds";
		const result = analyzePortfolio(input);
		expect(result.dimensions.reportedEconomicCurrency.equityValue).toBe(0);
		expect(result.dimensions.reportedEconomicCurrency.status).toBe("unavailable");
		expect(result.snapshot.request.holdings[0]?.currencyEvidence?.exposure?.source).toEqual(source);
	});

	it("refuses unsupported evidence instead of ignoring it", () => {
		for (const evidence of [
			{ exposure: { ...exposure(), basis: "country_proxy" } },
			{ hedge: { ...unhedged, status: "verified" } },
			{ hedge: { ...unhedged, ratio: 1 } },
			{ exposure: exposure([{ key: "USD", weight: 1.1 }]) },
			{ exposure: exposure([{ key: "USD", weight: 0.4 }, { key: "USD", weight: 0.4 }]) },
			{ exposure: { ...exposure(), source: { reference: "", asOf: "2026-09-30" } } },
			{ exposure: { ...exposure(), source: { ...source, asOf: "2026-12-01" } } },
		]) expect(() => analyzePortfolio(request(evidence as HoldingCurrencyEvidence))).toThrow(PortfolioInputError);
	});

	it("does not produce a stress-compatible economicCurrency object", () => {
		const result = analyzePortfolio(request({ exposure: exposure(), hedge: unhedged }));
		for (const economicCurrency of [result.dimensions.economicCurrency, result.dimensions.reportedEconomicCurrency]) {
			expect(() => evaluateStressScenario({
				baseCurrency: "EUR", scenario: BUILT_IN_SCENARIOS[0]!, holdings: [{
					holdingId: "share", ticker: "SYN", name: "Synthetic company", isin: "US1111110005", assetClass: "equities", sector: null, currentValue: 60,
					economicCurrency: economicCurrency as unknown as StressHoldingInput["economicCurrency"],
				}],
			})).toThrow(StressInputError);
		}
	});

	it("retains immutable evidence for replay and refuses v2 relabeling", () => {
		const input = request({ exposure: exposure(), hedge: unhedged });
		const before = JSON.stringify(input);
		const result = analyzePortfolio(input);
		expect(JSON.stringify(input)).toBe(before);
		expect(Object.isFrozen(result.dimensions.reportedEconomicCurrency.byHolding[0]?.evidence)).toBe(true);
		expect(replayPortfolioAnalysis(JSON.parse(JSON.stringify(result.snapshot)))).toEqual(result);
		expect(() => replayPortfolioAnalysis({ ...result.snapshot, methodologyVersion: "portfolio-intelligence-v2" })).toThrow(/original package.*new evaluation/);
	});
});
