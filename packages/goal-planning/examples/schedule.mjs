import assert from "node:assert/strict";
import { planGoalCash, replayGoalCash } from "../dist/index.js";

// Synthetic values; no account, provider, database or market data is accessed.
const request = {
	reportingCurrency: "EUR",
	asOfDate: "2026-01-01",
	unallocatedCash: 1000,
	reserveFloor: 1000,
	monthlyCapacity: 1000,
	obligationsComplete: true,
	paymentsTreatment: "already_netted",
	recurringPayments: [],
	liquidityNeeds: [{ id: "annual-expense", dueDate: "2027-01-01", amount: 1000 }],
	goals: [{
		id: "goal", deadline: "2027-01-01", monthlyContribution: 500,
		targetAmount: 10000, startingCapital: { amount: 0, asOfDate: "2026-01-01", sourceIds: [] },
	}],
};

const distant = planGoalCash(request);
assert.equal(distant.status, "feasible");
assert.equal(distant.goals[0].fundedTotal, 6000);
assert.equal(distant.rows.at(-1).cash, 6000);
assert.deepEqual(replayGoalCash(JSON.parse(JSON.stringify(distant.snapshot))), distant);

const earlier = structuredClone(request);
earlier.liquidityNeeds[0].dueDate = "2026-03-01";
const tight = planGoalCash(earlier);
assert.equal(tight.status, "constrained");
assert.equal(tight.rows[0].futureCommitmentReserve, 1000);
assert.equal(tight.goals[0].fundedTotal, 5500);

const sameDay = structuredClone(request);
sameDay.liquidityNeeds[0].dueDate = "2026-02-01";
const late = planGoalCash(sameDay);
assert.equal(late.rows[0].liquidityShortfall, 1000);
assert.equal(late.rows[0].overduePayments, 0);
assert.equal(late.status, "constrained");

console.table([distant, tight, late].map((result, i) => ({
	case: ["Later payment, full funding", "Earlier payment, necessary buffer", "Same-day income settles late"][i],
	status: result.status,
	funded: result.goals[0].fundedTotal,
	firstBuffer: result.rows[0].futureCommitmentReserve,
	firstDueTimeShortfall: result.rows[0].liquidityShortfall,
})));
