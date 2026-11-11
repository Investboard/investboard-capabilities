# Changelog

## 0.2.0 (unreleased)

- Schedule the goals that have what the ledger needs and leave out the rest, instead of withholding the whole ledger. A goal with an unknown deadline or monthly contribution, a passed deadline, a deadline before the first monthly savings date, or requests beyond the supported range is left out. The result lists each one in the new optional `leftOutGoals` field with its reasons; the field is absent when every goal is scheduled.
- A schedule that leaves a goal out returns `status: "incomplete"` with the first reason code `partial_schedule_goals_left_out`, and keeps the exact-cent ledger for the scheduled goals. `partial_schedule_constrained` marks an underfunded request, late payment or breached reserve within that ledger. A missing declaration still withholds the whole ledger, and `leftOutGoals` still names the goals it would have left out.
- A goal whose deadline has passed is accepted as its own state (`deadline_passed`) instead of being refused, and a deadline before the first savings date is reported as `deadline_before_first_savings_date`. A left-out goal is never counted as funded: its requested and funded totals, no-growth outcome and target gap stay `null`. Previously a deadline on the observation day reported a zero funded total and a target gap from starting capital.
- New calculations pin methodology `goal-cash-schedule-v2`. A saved `goal-cash-schedule-v1` snapshot replays under version 1 rules and returns the result it was saved with, including its `goal-cash-schedule-v1` snapshot. To apply version 2, evaluate the saved request again with `planGoalCash` and store the new snapshot.

## 0.1.0

Initial standalone source package with deadline-aware cash scheduling for competing goals, protected reserves, dated obligations and JSON replay.
