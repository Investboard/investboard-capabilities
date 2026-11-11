export type Point = { date: string; value: number };
export type Basis = "price" | "distribution_adjusted";
export type Listing = {
	symbol: string;
	isin: string;
	exchange: string;
	currency: string;
	kind: "stock" | "fund";
};
/** Caller declarations, not proof of authenticity or redistribution rights. */
export type Source = {
	id: string;
	revision: string;
	observedAt: string;
	publishedAt: string | null;
	url: string | null;
};
export type FxHistory = {
	baseCurrency: string;
	quoteCurrency: string;
	source: Source;
	/** One unit of baseCurrency buys value units of quoteCurrency. */
	points: Point[];
};
export type InstrumentHistory = {
	listing: Listing;
	basis: Basis;
	source: Source;
	points: Point[];
	/** Direct listing-to-reporting quotes, never an inferred inverse/cross rate. */
	fx: FxHistory | null;
};
export type StatementValues = {
	revenue: number | null;
	netIncome: number | null;
	operatingIncome: number | null;
	dilutedEps: number | null;
	totalAssets: number | null;
	totalDebt: number | null;
	equity: number | null;
	operatingCashFlow: number | null;
	capitalExpenditure: number | null;
	freeCashFlow: number | null;
};
export type Statement = {
	listing: Listing;
	kind: "income" | "balance" | "cash_flow";
	periodEnd: string;
	fiscalYear: string;
	period: "FY" | "Q1" | "Q2" | "Q3" | "Q4";
	currency: string;
	filingDate: string | null;
	acceptedAt: string | null;
	source: Source;
	/** Raw signed reporting-currency amounts; dilutedEps is per share. */
	values: Partial<StatementValues>;
};
export type PeriodCapitalization = {
	listing: Listing;
	periodEnd: string;
	fiscalYear: string;
	currency: string;
	value: number | null;
	source: Source;
};
export type Investment = { lumpSum: number; monthlyContribution: number };
export type ResearchRequest = {
	asOf: string;
	from: string;
	to: string;
	vintage: "retained" | "original_public";
	listing: Listing;
	reportingCurrency: string;
	history: InstrumentHistory | null;
	statements: Statement[];
	capitalizations: PeriodCapitalization[];
	investment: Investment | null;
};
export type PairRequest = {
	asOf: string;
	vintage: "retained" | "original_public";
	listings: [Listing, Listing];
	reportingCurrency: string;
	series: [InstrumentHistory, InstrumentHistory];
	horizons: (1 | 3 | 5 | 10)[];
};
export type Quality = {
	availability: "available" | "partial" | "unavailable";
	freshness: "fresh" | "stale" | "unknown";
	reasons: string[];
	firstDate: string | null;
	lastDate: string | null;
};
export type DrawdownPoint = Point & { drawdown: number; peak: number };
export type DrawdownResult = {
	maxDrawdown: number;
	maxDrawdownDate: string;
	peakDate: string;
	recoveryDate: string | null;
	timeSeries: DrawdownPoint[];
};
/** Return/volatility/ratio fields are fractions, never percentage points. */
export type HistoryMetrics = {
	referenceId: string;
	basis: Basis;
	from: string;
	to: string;
	actualFrom: string | null;
	actualTo: string | null;
	observations: number;
	cumulativeReturn: number | null;
	cagr: number | null;
	annualizedVolatility: number | null;
	maxDrawdown: number | null;
	peakDate: string | null;
	troughDate: string | null;
	recoveryDate: string | null;
	quality: Quality;
};
export type Correlation = {
	left: string;
	right: string;
	currency: string;
	horizon: 1 | 3 | 5 | 10;
	from: string;
	to: string;
	frequency: "weekly";
	leftBasis: Basis;
	rightBasis: Basis;
	coefficient: number | null;
	sampleCount: number;
	expectedCount: number;
	coverage: number;
	interval95: number[] | null;
	quality: Quality;
};
export type InvestmentReading = {
	totalContributed: number;
	endingValue: number;
	/** Null when nothing was contributed: a return on zero money is undefined. */
	contributionReturn: number | null;
	annualizedMoneyWeightedReturn: number | null;
	moneyWeightedReason: string | null;
	/** Actual execution dates; monthly anniversaries clamp at month end. */
	contributions: { date: string; amount: number }[];
};
export type FundamentalPeriod = {
	periodEnd: string;
	fiscalYear: string;
	period: Statement["period"];
	currency: string;
	values: StatementValues;
	netMargin: number | null;
	debtToEquity: number | null;
	valuation: {
		marketCap: number | null;
		priceToEarnings: number | null;
		priceToBook: number | null;
		freeCashFlowYield: number | null;
	};
	statements: Statement[];
	reasons: string[];
};
/** New calculations pin v2; saved v1 snapshots replay under version 1 rules. */
export type MethodologyVersion =
	| "instrument-research-v1"
	| "instrument-research-v2";
export type Snapshot<T> = {
	methodologyVersion: MethodologyVersion;
	request: T;
};
export type ResearchResult = {
	snapshot: Snapshot<ResearchRequest>;
	history: {
		metrics: HistoryMetrics | null;
		investment: InvestmentReading | null;
		reasons: string[];
	};
	fundamentals: { periods: FundamentalPeriod[]; reasons: string[] };
	interpretation: "caller_supplied_retained_evidence_not_original_public_vintages";
};
export type PairResult = {
	snapshot: Snapshot<PairRequest>;
	correlations: Correlation[];
	reasons: string[];
	interpretation: "descriptive_pair_not_portfolio_risk";
};
