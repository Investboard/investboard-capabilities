import type { CrisisDefinition } from "./crisis-definitions.js";
import {
	ASIAN_CRISIS_1997,
	BLACK_MONDAY_1987,
	BOND_MASSACRE_1994,
	GULF_WAR_1990,
	RUSSIA_LTCM_1998,
	SEPTEMBER_2001,
} from "./crisis-definitions-1987-2001.js";
import {
	BANKING_STRESS_2023,
	CHINA_SHOCK_2015,
	Q4_2018,
	YEN_CARRY_2024,
} from "./crisis-definitions-2015-2024.js";
export const EXTENDED_SCENARIOS: readonly CrisisDefinition[] = [
	BLACK_MONDAY_1987,
	GULF_WAR_1990,
	BOND_MASSACRE_1994,
	ASIAN_CRISIS_1997,
	RUSSIA_LTCM_1998,
	SEPTEMBER_2001,
	CHINA_SHOCK_2015,
	Q4_2018,
	BANKING_STRESS_2023,
	YEN_CARRY_2024,
] as const;
