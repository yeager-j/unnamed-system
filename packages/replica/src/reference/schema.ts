import type { StandardSchemaV1 } from "../standard-schema"

/**
 * A minimal synchronous Standard Schema factory for the reference fixtures.
 * Applications bring their own implementing library (Zod, Valibot, ArkType);
 * this exists so the package's reference binding stays dependency-free.
 */
export function schemaOf<T>(
  parse: (input: unknown) => T
): StandardSchemaV1<unknown, T> {
  return {
    "~standard": {
      version: 1,
      vendor: "replica-reference",
      validate: (value) => {
        try {
          return { value: parse(value) }
        } catch (error) {
          return {
            issues: [
              {
                message: error instanceof Error ? error.message : String(error),
              },
            ],
          }
        }
      },
    },
  }
}

export function parseRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("expected an object")
  }
  return input as Record<string, unknown>
}

export function parseString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`expected non-empty string "${field}"`)
  }
  return value
}

export function parseCount(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`expected non-negative integer "${field}"`)
  }
  return value
}
