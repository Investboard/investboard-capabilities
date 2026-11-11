# Changelog

## 0.2.0 (unreleased)

Follows Investboard's X-Ray after its asset-class line was aligned with the dashboard. Methodology `portfolio-intelligence-v2`; a `v1` snapshot is refused rather than replayed to different figures.

- A company held through an equity fund and through a fund in another class (real estate, commodities) is now one position per class. The equity part carries the sector and region; the other part stays in its class with neither. Issuer groups and concentration still read one company.
- The basis is computed by the engine's own by-holding breakdown, so each holding counts whole in its class whatever the merge does.
- A fund whose reported class is `real_estate` counts as equities: an ETF of real-estate companies is a stock fund, and the class real estate is kept for holdings that own buildings.
- Security profiles are matched per position, not per ISIN, so the two class parts of one company are classified independently.

## 0.1.0 (unreleased)

Initial standalone source package: equity look-through of funds with the equities-only rule, merged positions with provenance, basis by holding, sector, country, region, listing and economic currency dimensions, fund-pair overlap, issuer concentration with bounds, coverage and fund treatment, the weekly correlation matrix over 1, 3, 5 and 10 years, seven synthetic parity portfolios, and JSON replay.
