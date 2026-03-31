export function migrateDb(db: unknown, entries: { sql: string; timestamp: number; name: string }[]) {
  const migrations = entries.map((entry) => ({
    sql: entry.sql.split("--> statement-breakpoint"),
    folderMillis: entry.timestamp,
    hash: "",
    bps: true,
    name: entry.name,
  }))

  const target = db as {
    dialect: {
      migrate: (migrations: typeof migrations, session: unknown, config?: unknown) => unknown
    }
    session: unknown
  }

  return target.dialect.migrate(migrations, target.session)
}
