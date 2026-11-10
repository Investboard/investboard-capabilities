# Changelog

## 0.2.0 (unreleased)

- Apply broker amount rules before counting admitted orders. Rejected proposals leave the slot available, and admitted amounts are ranked after caps and rounding.
- Preserve known fee and tax components when totals are incomplete. Guaranteed funding and reserve failures are unavailable; unknown totals remain null.
- Use `rebalance-comparison-v2` for the changed calculation behavior. Version 1 comparison replay is refused. The input shape is unchanged; callers can explicitly review a new comparison from an old snapshot's request.
- Preserve direct contribution allocation and `contribution-projection-v1` behavior.
- Rebuild from source during normal `npm pack` to keep packed JavaScript and declarations current.

## 0.1.0

Initial standalone source package with contribution allocation, four-way comparison, explicit sale/tax inputs, depot funding, recurring projections and JSON replay.
