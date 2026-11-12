/** The eight asset classes a holding can belong to. */
export type AssetClass =
	| "equities"
	| "bonds"
	| "gold"
	| "crypto"
	| "cash"
	| "alternatives"
	| "real_estate"
	| "commodities";

/** An asset class, or explicitly unknown. */
export type HoldingClass = AssetClass | "unknown";

export interface PortfolioRequest {
	/** The analysis date, YYYY-MM-DD. */
	asOf: string;
	/** ISO 4217, upper case. Every holding value is already in this currency. */
	baseCurrency: string;
	/** Every holding of the whole portfolio, cash, bonds, gold and crypto included. */
	holdings: HoldingInput[];
	/** Constituent lists and reported breakdowns for fund holdings. */
	funds?: FundInput[];
	/** Classification of individual securities by ISIN (company profiles). */
	securities?: SecurityProfile[];
	/** Reviewed corrections of a fund's class or treatment. */
	fundOverrides?: FundOverride[];
}

/** Caller-supplied document provenance; the engine never verifies or fetches it. */
export interface CurrencySource {
	reference: string;
	/** Effective observation/policy date, not the date of this calculation. */
	asOf: string;
}

export interface HoldingCurrencyEvidence {
	/** Pre-hedge economic exposure, fractions of this exact holding. Missing mass stays unknown. */
	exposure?: {
		basis: "reported_economic_exposure";
		source: CurrencySource;
		buckets: BreakdownEntry[];
	};
	/** Policy stated by the source, never inferred from a name or listing denomination. */
	hedge?: (
		| { status: "unhedged" }
		| { status: "full"; targetCurrency: string }
		| { status: "partial"; targetCurrency?: string }
		| { status: "unknown" }
	) & { basis: "reported_hedge_policy"; source: CurrencySource };
}

/** Qualification travels with the figures, including through JSON serialization. */
export interface CurrencyQualification {
	basis:
		| "caller_supplied_listing_denomination"
		| "country_proxy_with_name_hedge_assumption";
	methodologyVersion: "listing-denomination-v1" | "country-name-currency-proxy-v1";
	independentlyVerified: false;
	hedgePolicy: "not_verified";
	stressUse: "ineligible";
	weightBasis: "whole_valued_portfolio";
	coverageBasis: "whole_valued_portfolio" | "valued_equity_value";
	hedgeRatio: null;
}

export interface ReportedCurrencyHolding {
	holdingId: string;
	isin: string | null;
	value: number;
	weight: number;
	/** Exact caller evidence, including explicitly reported zero exposures. */
	evidence: HoldingCurrencyEvidence | null;
	method: "source_backed_unhedged" | "source_backed_full_hedge_model" | "unknown";
	reasonCodes: string[];
	buckets: Bucket[];
	/** Source-backed is not independently verified by this module. No stress input is emitted. */
	stressHandoff: "independent_verification_required" | "unavailable";
}

export interface ReportedCurrencyDimension extends Dimension {
	status: Status;
	basis: "caller_supplied_source";
	independentlyVerified: false;
	scope: "equity";
	weightBasis: "whole_valued_portfolio";
	coverageBasis: "valued_equity_value";
	equityValue: number;
	assignedValue: number;
	unknownValue: number;
	byHolding: ReportedCurrencyHolding[];
}

export interface HoldingInput {
	id: string;
	kind: "security" | "fund" | "cash";
	name: string;
	isin?: string | null;
	ticker?: string | null;
	/** Value in the base currency; null when the holding could not be valued. */
	value: number | null;
	/** Caller-reported quote denomination; never economic exposure. */
	listingCurrency: string;
	listingCurrencySource?: CurrencySource;
	currencyEvidence?: HoldingCurrencyEvidence;
	assetClass: HoldingClass;
}

export interface ConstituentInput {
	id: string;
	isin?: string | null;
	name: string;
	/** Share of the fund, a fraction of 1. */
	weight: number;
}

export interface BreakdownEntry {
	key: string;
	/** Share of the fund, a fraction of 1. */
	weight: number;
}

export type FundHoldings =
	| { status: "listed"; asOf: string; constituents: ConstituentInput[] }
	| { status: "none_reported" }
	| { status: "missing" };

export interface FundInput {
	holdingId: string;
	/** The class the fund's own documents report. */
	reportedClass?: AssetClass | null;
	holdings: FundHoldings;
	sectorBreakdown?: BreakdownEntry[] | null;
	countryBreakdown?: BreakdownEntry[] | null;
	/** An index constituent list to read through when the fund publishes none. */
	readThrough?: {
		index: string;
		fundName: string;
		asOf: string;
		constituents: ConstituentInput[];
	} | null;
}

export interface SecurityProfile {
	isin: string;
	name?: string | null;
	sector?: string | null;
	industry?: string | null;
	country?: string | null;
	issuerName?: string | null;
	/** The security's class as profiled; null when the profile is a fund's own, not a company's. */
	assetClass?: string | null;
}

export interface FundOverride {
	isin: string;
	assetClass: AssetClass;
	/** True: the fund is held whole in this class. False: the class is a reviewed correction and the fund is otherwise resolved normally. */
	heldWhole: boolean;
}

export type Status = "available" | "partial" | "unavailable";

export interface Bucket {
	key: string;
	value: number;
	weight: number;
}

/** Buckets of one dimension; an "unknown" bucket, when present, is last. */
export interface Dimension {
	coverage: number;
	buckets: Bucket[];
}

export interface Position {
	id: string;
	isin: string | null;
	ticker: string | null;
	name: string;
	value: number;
	weight: number;
	assetClass: HoldingClass;
	sector: string | null;
	region: string | null;
	/** True for the uncovered part of a fund, which is never a company. */
	residual: boolean;
	/** Whole-portfolio weight held directly. */
	direct: number;
	viaFunds: Array<{
		holdingId: string;
		name: string;
		weight: number;
		shareInFund: number;
	}>;
}

export interface IssuerExposure {
	key: string;
	name: string;
	value: number;
	weight: number;
	positionIds: string[];
}

export interface OverlapPair {
	fundA: string;
	fundB: string;
	overlap: number;
	sharedCount: number;
	shared: Array<{
		id: string;
		name: string;
		weightInA: number;
		weightInB: number;
	}>;
	sharedTail: { count: number; weight: number } | null;
}

export interface Bounded {
	value: number;
	bound: "exact" | "lower" | "upper";
}

export interface Concentration {
	status: "available" | "refused";
	refusal: string | null;
	attributedCoverage: number;
	topTenWeight: number;
	largestIssuer: { key: string; name: string; weight: number } | null;
	hhi: Bounded | null;
	effectiveIssuers: Bounded | null;
}

export interface FundTreatment {
	holdingId: string;
	treatment: "looked_through" | "held_whole" | "pending";
	coveredWeight: number;
	asOf: string | null;
	readThrough: { index: string; fundName: string } | null;
}

export interface PortfolioResult {
	methodologyVersion: string;
	status: Status;
	reasonCodes: string[];
	baseCurrency: string;
	asOf: string;
	constituentsAsOf: string | null;
	valuation: {
		valuedTotal: number;
		valuedCount: number;
		unvalued: Array<{ id: string; name: string }>;
	};
	basis: Bucket[];
	positions: Position[];
	issuers: IssuerExposure[];
	dimensions: {
		sector: Dimension;
		country: Dimension;
		region: Dimension;
		listingCurrency: Dimension & { qualification: CurrencyQualification };
		/** Geography/name estimate. This is not verified corporate economic exposure. */
		economicCurrency: Dimension & {
			qualification: CurrencyQualification;
			/** Whole-book share allocated by the name-based full-hedge assumption, NOT a hedge ratio. */
			nameInferredHedgeWeight: number;
			/** Name hints only. Unknown source date and hedge ratio stay null. */
			nameInferredHedges: Array<{
				id: string; name: string; isin: string | null;
				targetCurrency: string | null; weight: number;
				basis: "fund_name_inference"; sourceAsOf: null; hedgeRatio: null;
			}>;
		};
		/** Separate source-backed model; never filled from countries, names or listing currency. */
		reportedEconomicCurrency: ReportedCurrencyDimension;
	};
	overlap: OverlapPair[];
	concentration: Concentration;
	coverage: {
		transparent: number;
		opaqueInherent: number;
		opaquePending: number;
	};
	funds: FundTreatment[];
	snapshot: PortfolioSnapshot;
}

export interface PortfolioSnapshot {
	methodologyVersion: string;
	request: PortfolioRequest;
}

export type CorrelationWindowName = "1y" | "3y" | "5y" | "10y";

export interface CorrelationRequest {
	/** The analysis date, YYYY-MM-DD; the matrix ends on the last Friday before it. */
	asOf: string;
	baseCurrency: string;
	holdings: Array<{
		id: string;
		name?: string;
		value: number | null;
		priceCurrency: string;
	}>;
	/** Daily closes in each holding's price currency. */
	closes: Array<{ id: string; date: string; close: number }>;
	/** One unit of `currency` equals `rateToBase` units of the base currency. */
	fx?: Array<{ currency: string; date: string; rateToBase: number }>;
}

export interface CorrelationSnapshot {
	methodologyVersion: string;
	request: CorrelationRequest;
}
