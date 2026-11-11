# Changelog

## 0.2.0 (unreleased)

- A valid window with only two observations now returns its cumulative return and drawdown and leaves `annualizedVolatility` null, instead of raising `ResearchInputError`. Sample volatility needs at least two returns. Such a request previously failed, so no saved snapshot is affected.
- A contribution illustration with zero total contributions reports `contributionReturn: null` instead of `0`: a return on no money is undefined. `InvestmentReading.contributionReturn` is now typed `number | null`.
- A pair whose series declare different return bases (`price` and `distribution_adjusted`) carries the pair-level reason `mixed_return_basis`. The coefficient is unchanged.
- New calculations pin methodology `instrument-research-v2`. A saved `instrument-research-v1` snapshot replays under version 1 rules and returns the result it was saved with: a zero-contribution return of `0`, no `mixed_return_basis` reason, and its `instrument-research-v1` snapshot. To apply version 2, evaluate the saved request again and store the new snapshot.

## 0.1.0

Initial standalone source package with exact-listing history, dated FX, reported statement ratios, common-week pair comparisons and JSON replay.
