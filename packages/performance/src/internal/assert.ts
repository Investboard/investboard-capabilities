// Copyright 2026 Investboard GmbH. SPDX-License-Identifier: Apache-2.0
export function assertNever(value: never, context?: string): never {
	throw new Error(`Unhandled ${context ?? "case"}: ${String(value)}`);
}
