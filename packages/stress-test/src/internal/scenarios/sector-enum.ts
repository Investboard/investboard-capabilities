export const STRESS_TEST_SECTORS = [
	"Technology",
	"Healthcare",
	"Financials",
	"Consumer Discretionary",
	"Consumer Staples",
	"Industrials",
	"Energy",
	"Materials",
	"Utilities",
	"Real Estate",
	"Communication Services",
	"Other",
] as const;
export type StressTestSector = (typeof STRESS_TEST_SECTORS)[number];
const FMP_SECTOR_MAP: Record<string, StressTestSector> = {
	"financial services": "Financials",
	communication: "Communication Services",
	"telecommunication services": "Communication Services",
	"consumer cyclical": "Consumer Discretionary",
	"consumer defensive": "Consumer Staples",
	"basic materials": "Materials",
};
const GERMAN_SECTOR_MAP: Record<string, StressTestSector> = {
	technologie: "Technology",
	gesundheitswesen: "Healthcare",
	gesundheit: "Healthcare",
	finanzen: "Financials",
	finanzdienstleistungen: "Financials",
	konsumgueter: "Consumer Discretionary",
	"zyklische konsumgueter": "Consumer Discretionary",
	basiskonsumgueter: "Consumer Staples",
	"nichtzyklische konsumgueter": "Consumer Staples",
	industrie: "Industrials",
	energie: "Energy",
	grundstoffe: "Materials",
	rohstoffe: "Materials",
	versorger: "Utilities",
	versorgungsunternehmen: "Utilities",
	immobilien: "Real Estate",
	kommunikation: "Communication Services",
	kommunikationsdienste: "Communication Services",
};
const SECTOR_ALIAS_MAP: Record<string, StressTestSector> = {
	...FMP_SECTOR_MAP,
	...GERMAN_SECTOR_MAP,
};
const CANONICAL_LOWER_MAP = new Map<string, StressTestSector>(
	STRESS_TEST_SECTORS.map((s) => [s.toLowerCase(), s]),
);
export function resolveStressTestSector(
	sector: string | null,
	assetClass: string | null,
): StressTestSector {
	if (assetClass !== "equities") {
		return "Other";
	}
	if (!sector || sector.trim() === "") {
		return "Other";
	}
	const trimmed = sector.trim();
	if ((STRESS_TEST_SECTORS as readonly string[]).includes(trimmed)) {
		return trimmed as StressTestSector;
	}
	const lower = trimmed.toLowerCase();
	const canonical = CANONICAL_LOWER_MAP.get(lower);
	if (canonical) {
		return canonical;
	}
	const alias = Object.hasOwn(SECTOR_ALIAS_MAP, lower)
		? SECTOR_ALIAS_MAP[lower]
		: undefined;
	if (alias) {
		return alias;
	}
	console.warn(
		`[stress-test] Unmapped sector: "${sector}" — falling back to "Other"`,
	);
	return "Other";
}
