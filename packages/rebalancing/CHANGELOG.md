# Changelog

## 0.5.0 (unreleased)

- Choose the holding that receives a class purchase by rank: a usable price first, then a fund or ETF before a single share, then the larger value, then the smaller holding ID. Holdings gain optional `fund` and `priced` booleans; a holding without them ranks with unpriced single shares, so requests without declarations keep buying the largest holding.
- Consolidate generated contribution amounts that fall below the smallest order a class's accounts admit into the fewest orders that move the book toward target, instead of leaving them as cash. An order may no longer cost what it buys: an account whose known buy fee is at least the order amount does not admit it.
- In largest-holding mode, route amounts the first account refuses or caps to the other accounts that hold the class, lowest declared buy fee first, then accounts without declared rules. For example, a 100 contribution into a holding whose account caps orders at 1 now buys 1 there and 99 in the second account that holds the class, where 0.4 retained 99 as cash.
- Report money no admissible order can take after consolidation and routing as `uninvestedCash`, with `uninvested_below_order_minimum` or `uninvested_above_order_maximum`. Such a scenario is `conditional`, never `feasible`.
- Keep the current allocation available when the reserve already sits below `cashFloor`, and treat fresh cash that raises the reserve without reaching the floor the same way: both are `conditional` with `reserve_floor_not_reached` and state `reserveShortfall`. A scenario that would lower the reserve below the floor stays `unavailable` with `reserve_shortfall`.
- Use `rebalance-comparison-v5` for new comparisons. Saved `rebalance-comparison-v4` snapshots replay under the v4 rules and return their original results; they cannot carry `fund` or `priced`. v1 to v3 replay is still refused. To apply the new rules to a saved request, call `compareRebalance(savedSnapshot.request)` and store the new snapshot separately.
- Direct `allocateContribution` and `projectContributions` results are unchanged, and projections keep `contribution-projection-v3`.

## 0.4.1 (unreleased)

- Make `AccountRules` an exclusive union: declare either `feePerTrade` (including null) or separate buy/sell fee schedules. TypeScript now rejects missing or conflicting fee declarations, matching the existing runtime validator.
- Add compile-time regressions for valid flat/scheduled/unknown fees and invalid combinations. Account specializations should use intersection types rather than extending the former interface.
- Calculation behavior, JSON requests and comparison/projection methodology versions are unchanged.

## 0.4.0

- Require host-selected purchase placement and existing-cash funding policies. Ordered routes spill broker-capped/rounded amounts to subsequent destinations and determine order admission priority. Largest-holding placement remains an explicit option.
- Release host-selected existing cash above the pooled reserve without a security sale, tax estimate, extra fee or wealth inflation. Report cash releases separately from external cash and sales in alternatives and depot funding.
- Require projection cash handling: retain skipped cash or reinvest excess cash in later periods. Direct pooled allocations also require an existing-cash deployment choice.
- Generalize projections to explicit periods/cadence, constant or per-period contributions, and constant or per-period annual-effective return paths. Rename the configured horizon to projectionPeriods.
- Use comparison v4 and projection v3. Older comparison replay is refused; migration requires explicit policies and projection field mapping. No Investboard policy preset is exported.

## 0.3.0

- Require a caller-supplied configuration for monetary precision, maximum wealth, capacities, cash class, optional currency allow-list and optional return bounds. Remove the public EUR/USD, cent, 200-holding, 32-class, 100-order/account, 600-month and billion-unit product limits.
- Accept caller-defined scenario IDs and lists: keep, contribution, explicit plan (including contributions with sales), and explicitly unavailable scenarios. Default ordering preserves the input list.
- Support separate buy/sell fixed-plus-percentage fee schedules with min/max caps and minor-unit rounding, plus exact per-order overrides for external models. Preserve flat-fee declarations and unknown-cost lower-bound checks.
- Record the complete configuration and scenario list in comparison v3 and projection v2 requests. Refuse comparison v1/v2 replay; migration requires an explicit configuration and scenario mapping. This is a breaking request API change.
- Keep universal numerical representation checks and plain JSON validation. No Investboard app preset is exported.

## 0.2.0

- Apply broker amount rules before counting admitted orders. Rejected proposals leave the slot available, and admitted amounts are ranked after caps and rounding.
- Preserve known fee and tax components when totals are incomplete. Guaranteed funding and reserve failures are unavailable; unknown totals remain null.
- Use `rebalance-comparison-v2` for the changed calculation behavior. Version 1 comparison replay is refused. The input shape is unchanged; callers can explicitly review a new comparison from an old snapshot's request.
- Preserve direct contribution allocation and `contribution-projection-v1` behavior.
- Rebuild from source during normal `npm pack` to keep packed JavaScript and declarations current.

## 0.1.0

Initial standalone source package with contribution allocation, four-way comparison, explicit sale/tax inputs, depot funding, recurring projections and JSON replay.
