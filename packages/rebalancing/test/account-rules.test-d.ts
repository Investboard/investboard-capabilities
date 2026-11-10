import type { AccountRules, FeeSchedule } from "../src/index.js";

const amountRules = {
	depotId: "synthetic",
	minimum: 0,
	maximum: 0,
	increment: 0.01,
};
const schedule: FeeSchedule = { fixed: 1, rate: 0.001, rounding: "up" };

const flat: AccountRules = { ...amountRules, feePerTrade: 0 };
const unknownFlat: AccountRules = { ...amountRules, feePerTrade: null };
const scheduled: AccountRules = {
	...amountRules,
	fees: { buy: schedule, sell: null },
};
const unknownSchedules: AccountRules = {
	...amountRules,
	fees: { buy: null, sell: null },
};

// @ts-expect-error A fee model must be declared, even when its cost is unknown.
const missing: AccountRules = { ...amountRules };
// @ts-expect-error Flat and scheduled fees are mutually exclusive.
const conflicting: AccountRules = {
	...amountRules,
	feePerTrade: 0,
	fees: { buy: schedule, sell: null },
};
// @ts-expect-error Null flat fees are still a declaration and cannot coexist with schedules.
const conflictingUnknown: AccountRules = {
	...amountRules,
	feePerTrade: null,
	fees: { buy: null, sell: null },
};

void [
	flat,
	unknownFlat,
	scheduled,
	unknownSchedules,
	missing,
	conflicting,
	conflictingUnknown,
];
