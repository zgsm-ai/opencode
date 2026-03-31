import { DatabaseSync } from "node:sqlite"

export class Database extends DatabaseSync {
  constructor(filename, options = {}) {
    super(filename)
    if (options.create === false) {
      return
    }
  }
}
