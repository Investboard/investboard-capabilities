# Changelog

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
