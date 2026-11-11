/** Normalising sector labels to Investboard's eleven sector groups. */
export const XRAY_SECTORS = [
	"technology",
	"financials",
	"healthcare",
	"industrials",
	"consumerDiscretionary",
	"consumerStaples",
	"energy",
	"utilities",
	"materials",
	"realEstate",
	"communication",
] as const;
export type XraySector = (typeof XRAY_SECTORS)[number];
const MAP: Record<string, XraySector> = {
	technology: "technology",
	"information technology": "technology",
	"financial services": "financials",
	financials: "financials",
	healthcare: "healthcare",
	"health care": "healthcare",
	industrials: "industrials",
	"consumer cyclical": "consumerDiscretionary",
	"consumer discretionary": "consumerDiscretionary",
	"consumer defensive": "consumerStaples",
	"consumer staples": "consumerStaples",
	energy: "energy",
	utilities: "utilities",
	"basic materials": "materials",
	materials: "materials",
	"real estate": "realEstate",
	"communication services": "communication",
	"telecommunication services": "communication",
};
export function normalizeSector(
	raw: string | null | undefined,
): XraySector | null {
	if (!raw) return null;
	const key = raw.trim().toLowerCase();
	return Object.hasOwn(MAP, key) ? (MAP[key] ?? null) : null;
}
