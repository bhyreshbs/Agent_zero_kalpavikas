/**
 * Shim: wraps node-sqlite3-wasm to match the better-sqlite3 API surface used
 * by this project, so the rest of the codebase doesn't need any changes.
 *
 * better-sqlite3:  stmt.run(a, b, c)   — spread args
 * node-sqlite3-wasm: stmt.run([a, b, c]) — array arg
 *
 * better-sqlite3:  stmt.run({ id: 1 }) — binds to @id, $id, or :id
 * node-sqlite3-wasm: stmt.run({ '@id': 1 }) — requires exact prefix
 *
 * This shim wraps prepare() to parse parameter names and maps object keys
 * to include the correct prefix.
 */
import sqlite3 from 'node-sqlite3-wasm';

class BetterSqlite3Compat {
  constructor(filepath) {
    this._db = new sqlite3.Database(filepath);
  }

  exec(sql) {
    this._db.exec(sql);
    return this;
  }

  pragma(pragma) {
    // Ignore PRAGMAs (like WAL) because the WASM VFS on Windows has locking bugs
    // when setting WAL or certain pragmas. The game works fine in default mode.
    return [];
  }

  prepare(sql) {
    const paramRegex = /([@$:])([a-zA-Z0-9_]+)/g;
    const params = [];
    let match;
    while ((match = paramRegex.exec(sql)) !== null) {
      params.push({ prefix: match[1], name: match[2], full: match[0] });
    }
    const stmt = this._db.prepare(sql);
    return new StatementCompat(stmt, params);
  }

  close() {
    this._db.close();
  }

  get inTransaction() {
    return this._db.inTransaction;
  }
}

class StatementCompat {
  constructor(stmt, params) {
    this._stmt = stmt;
    this._params = params;
  }

  _mapArgs(args) {
    if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      const input = args[0];
      const mapped = {};
      for (const p of this._params) {
        if (input[p.name] !== undefined) {
          mapped[p.full] = input[p.name];
        } else if (input[p.full] !== undefined) {
          mapped[p.full] = input[p.full];
        }
      }
      return mapped; // return mapped object directly
    }
    return args; // return positional array
  }

  run(...args) {
    return this._stmt.run(this._mapArgs(args));
  }

  get(...args) {
    return this._stmt.get(this._mapArgs(args));
  }

  all(...args) {
    return this._stmt.all(this._mapArgs(args));
  }
}

export default BetterSqlite3Compat;
