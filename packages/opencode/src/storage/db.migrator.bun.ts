import { migrate } from "drizzle-orm/bun-sqlite/migrator"

export function migrateDb(db: unknown, entries: { sql: string; timestamp: number; name: string }[]) {
  migrate(db as Parameters<typeof migrate>[0], entries)
}
