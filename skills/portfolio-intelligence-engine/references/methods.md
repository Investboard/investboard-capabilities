# Methods of the Portfolio Intelligence engine

What `@investboard/portfolio-intelligence` calculates, in the words to use when
explaining a result. Every value below is the engine's own; a test keeps the
constants table equal to the code.

## Denominators

Every weight is a share of the **whole valued portfolio**, cash included,
unless the field says otherwise. Unvalued holdings are listed and leave every
denominator. Sector, country and region weights are shares of the whole
portfolio too, but describe the equity part only; their `coverage` is the
classified share of the **equity part**. Concentration weights are shares of
the **equity part**.

To restate a whole-portfolio weight against another basis, convert it and say
so: 18% of a portfolio with 40% cash is `18 / (100 - 40) = 30%` of the
non-cash portion.

## Look-through

- Only funds that can hold listed companies are looked through. A cash, bond,
  gold or crypto fund is held whole in its class, whatever its list says.
- A stated class of cash, bonds, gold, crypto, real estate or commodities
  wins over the class a fund reports; a stated equities, alternatives or
  unknown class gives way to it.
- A constituent's whole-portfolio weight is the fund's weight times the
  constituent's weight in the fund. Direct holdings and constituents with the
  same identity (ISIN first, ticker otherwise) and class merge into one
  position, whose provenance lists each part. A company held through an equity
  fund and a fund of another class is one position per class; only the equity
  part has a sector and region.
- Real estate is a class for holdings that own buildings. An ETF of
  real-estate companies is a stock fund.
- The uncovered part of a fund stays one residual row in the fund's class. A
  fund is fully covered at `fundFullyCovered`.
- A fund held inside a fund stays one position; there is no recursive
  look-through.
- A fund without a list is pending, unless an index list is supplied to read
  through, which the result names.

## Basis

The basis groups the portfolio by asset class **by holding**: each fund whole
in its resolved class, each direct holding in its class. It is the answer
before looking inside funds.

## Currency evidence

Listing denomination is supplied by the caller; a missing CSV `listing_currency`
is refused, never filled with the valuation base currency. `economicCurrency`
is the existing country-to-currency/name-hedge estimate. Its qualification says
`country_proxy_with_name_hedge_assumption`, `independentlyVerified: false` and
`stressUse: "ineligible"`. Its coverage measures assigned equity mass, not
verified economic exposure. A recognized name can trigger a full allocation
assumption but never establishes hedge policy, a ratio or a source date.
`nameInferredHedgeWeight` is a whole-book hint-selected weight, not a hedge ratio.

`reportedEconomicCurrency` reads only explicit source evidence on each exact
holding. Sources retain reference and effective date; reported zero entries
survive; unreported mass stays unknown. Missing/partial/unknown hedge policies
withhold the net allocation. Source-backed declarations are not independently
verified by the module, and require separate identity/source/policy verification
before any verified stress handoff. See the package README for the input contract
and explicit v1/v2 historical replay versus v3 re-evaluation boundary.

## Overlap

Fund-pair overlap is `sum(min(weightA, weightB))` over the companies two funds
share: the weight that can be matched security by security between the two
separately normalized funds. It is not the investor's combined exposure to
shared names, nor the share of an equal-weight blend held in common names.
Pairs below `overlapFloor` are dropped; each pair lists its
`overlapSharedListed` largest shared companies. Never add pairwise overlaps
into a portfolio-wide figure.

## Concentration

Companies are grouped across share classes (US CUSIP prefix), depositary
receipts (verified name) and other lines of one issuer (normalized name). A
fund's uncovered remainder stays in the denominator, so company weights are
lower bounds and `attributedCoverage` is the attributed share.

`hhi` is the sum of squared company weights over attributed companies and
`effectiveIssuers` its inverse. Below full coverage they are a **lower** and an
**upper** bound. Below `concentrationCoverageFloor` attributed coverage both are
withheld, unless one company is measured above `concentrationMeasuredIssuer` of
the equity part. `topTenWeight` sums the `topPositions` largest positions.

## Coverage and status

`coverage` splits the whole portfolio into transparent, held whole by nature
(opaqueInherent) and pending missing data (opaquePending). The status is
`partial` with `unvalued_holdings`, `fund_holdings_missing` or
`classification_degraded`; the last applies when classifiable equity is at
least `classificationMinEquity` of the portfolio and less than
`classificationNamedFloor` of it has a sector.

## Correlations

- Weekly closes on Fridays, ending on the last Friday before the analysis
  date, converted to the base currency at the latest rate at most
  `correlationFxMaxAgeDays` old.
- Windows of `correlationWeeks1y`, `correlationWeeks3y`, `correlationWeeks5y`
  and `correlationWeeks10y` weeks. A holding needs returns in
  `correlationEligibleShare` of the weeks; a constant series is excluded,
  never given 0. All pairs share one common sample of weeks.
- A window needs `correlationMinHoldings` eligible holdings and
  `correlationCoveredValueFloor` of portfolio value; otherwise it is
  insufficient. Excluded value stays in the denominator.
- Pearson coefficients with a Fisher 95% interval. Bands: close from
  `bandCloseFrom`, partial from `bandPartialFrom`, independent from
  `bandIndependentFrom`, otherwise opposite; undetermined when the interval
  spans two boundaries. Near-duplicates from `correlationNearDuplicate`. Groups
  by average linkage while their mean correlation is at least
  `correlationGroupThreshold`. The `correlationWorstWeeks` worst weeks are
  reported.

Historical correlation describes the observed period. It is not holdings
overlap and does not predict future diversification.

## Constants

| Constant | Value |
| --- | --- |
| `fundFullyCovered` | 0.98 |
| `overlapFloor` | 0.01 |
| `overlapSharedListed` | 20 |
| `topPositions` | 10 |
| `concentrationCoverageFloor` | 0.8 |
| `concentrationMeasuredIssuer` | 0.1 |
| `classificationMinEquity` | 0.2 |
| `classificationNamedFloor` | 0.5 |
| `correlationWeeks1y` | 52 |
| `correlationWeeks3y` | 156 |
| `correlationWeeks5y` | 260 |
| `correlationWeeks10y` | 520 |
| `correlationEligibleShare` | 0.8 |
| `correlationCoveredValueFloor` | 0.6 |
| `correlationMinHoldings` | 3 |
| `correlationNearDuplicate` | 0.95 |
| `correlationGroupThreshold` | 0.7 |
| `correlationFxMaxAgeDays` | 4 |
| `correlationWorstWeeks` | 10 |
| `bandIndependentFrom` | -0.3 |
| `bandPartialFrom` | 0.3 |
| `bandCloseFrom` | 0.7 |
