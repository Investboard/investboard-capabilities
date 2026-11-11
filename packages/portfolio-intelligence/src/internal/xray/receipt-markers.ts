/** Recognising depositary receipts by their names. */
const RECEIPT_TOKEN = "(?:CEDEAR|ADR|BDR|CDR|GDR|NVDR)s?";
const BOUNDARY = "[^A-Za-z0-9-]";
const DEPOSITARY_RECEIPT_MARKER = new RegExp(
	`(?:^|${BOUNDARY})${RECEIPT_TOKEN}(?:${BOUNDARY}|$)|Depositary Receipts?|ADRhedged`,
	"i",
);
const STRIP_PATTERN = new RegExp(
	`(?:^|(?<=${BOUNDARY}))(?:${RECEIPT_TOKEN}|Depositary Receipts?|ADRhedged|Sponsored|Unsponsored)(?=${BOUNDARY}|$)`,
	"gi",
);
export function hasDepositaryReceiptMarker(
	name: string | null | undefined,
	ticker?: string | null,
): boolean {
	const trimmed = name?.trim();
	if (!trimmed) return false;
	if (ticker && trimmed.toUpperCase() === ticker.trim().toUpperCase()) {
		return false;
	}
	return DEPOSITARY_RECEIPT_MARKER.test(trimmed);
}
export function stripDepositaryReceiptMarkers(
	name: string | null | undefined,
): string | null {
	if (!name) return null;
	const stripped = name.replace(STRIP_PATTERN, " ").replace(/\s+/g, " ").trim();
	return stripped.length > 0 ? stripped : null;
}
