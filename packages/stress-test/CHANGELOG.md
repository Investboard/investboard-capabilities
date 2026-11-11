# Changelog

## 0.2.0 (unreleased)

- Correct the built-in currency moves. In the ten scenarios since 1999 (`gfc_2008`, `covid_2020`, `rate_hike_2022`, `euro_crisis_2011`, `dotcom_2000`, `september_2001`, `china_shock_2015`, `q4_2018`, `banking_stress_2023`, `yen_carry_2024`), the USD, GBP, CHF and JPY `currencyShocks` are now each currency's move against the euro computed from the ECB euro foreign exchange reference rates on the window's first and last day (start rate / end rate - 1, rounded to two decimals). The earlier hand-entered figures pointed the wrong way in 8 of these 40 entries and were off by more than five points in 9 others. For example, `gfc_2008` USD changes from -0.08 to +0.12 (ECB 1.4037 on 2007-10-09, 1.2565 on 2009-03-09), so EUR 100 of USD cash with a EUR base now ends at EUR 112.00 instead of EUR 92.00.
- Each corrected scenario names the ECB source and records `provenance.currencyReviewedAt`. `ScenarioProvenance` gains this optional field and request validation accepts it as an ISO date. The five scenarios before 1999, the EUR entries, and all sector and asset-class figures are unchanged.
- The calculation methodology stays `whole-wealth-currency-replay-v5`. A snapshot contains its complete scenario, so snapshots saved with 0.1.0 replay with the figures they were saved with. To apply the corrected figures, evaluate the saved holdings again with the current built-in scenario and store the new snapshot.
- Rebuild from source during normal `npm pack` to keep packed JavaScript and declarations current.

## 0.1.0

Initial standalone source package with 15 historical scenarios, holding-level impacts, explicit economic-currency inputs, caller-supplied price and FX history, and JSON replay.
