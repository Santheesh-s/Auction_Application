import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class PgPoolAdapter {
  constructor(connectionString) {
    this.pool = new pg.Pool({ connectionString });
  }

  async query(text, params) {
    const res = await this.pool.query(text, params);
    return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
  }

  async exec(sql) {
    await this.pool.query(sql);
  }

  async connect() {
    const client = await this.pool.connect();
    return {
      query: async (text, params) => {
        const res = await client.query(text, params);
        return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
      },
      exec: async (sql) => {
        await client.query(sql);
      },
      release: () => client.release(),
    };
  }

  async close() {
    await this.pool.end();
  }

  isEmbedded() {
    return false;
  }
}

class PGliteAdapter {
  constructor(dataDir) {
    this.dataDir = dataDir || path.resolve(__dirname, '../../data/pgdata');
    this.pglite = null;
    this.initPromise = null;
    this.transactionLock = Promise.resolve();
  }

  async ensureInit() {
    if (this.pglite) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        if (!fs.existsSync(this.dataDir)) {
          fs.mkdirSync(this.dataDir, { recursive: true });
        }
        this.pglite = new PGlite(this.dataDir);
        await this.pglite.waitReady;
      })();
    }
    await this.initPromise;
  }

  async query(text, params) {
    await this.ensureInit();
    const res = await this.pglite.query(text, params);
    return {
      rows: res.rows,
      rowCount: res.affectedRows ?? res.rows.length,
    };
  }

  async exec(sql) {
    await this.ensureInit();
    await this.pglite.exec(sql);
  }

  async connect() {
    await this.ensureInit();
    const self = this;

    let releaseLock = null;
    const previousLock = this.transactionLock;
    this.transactionLock = new Promise((resolve) => {
      releaseLock = resolve;
    });
    await previousLock;

    return {
      query: async (text, params) => {
        const res = await self.pglite.query(text, params);
        return {
          rows: res.rows,
          rowCount: res.affectedRows ?? res.rows.length,
        };
      },
      exec: async (sql) => {
        await self.pglite.exec(sql);
      },
      release: () => {
        if (releaseLock) {
          releaseLock();
          releaseLock = null;
        }
      },
    };
  }

  async close() {
    if (this.pglite) {
      await this.pglite.close();
      this.pglite = null;
    }
  }

  isEmbedded() {
    return true;
  }
}

let dbInstance = null;

export function getDb() {
  if (!dbInstance) {
    const connStr = process.env.DATABASE_URL?.trim();
    if (connStr && (connStr.startsWith('postgres://') || connStr.startsWith('postgresql://'))) {
      console.log('Using PostgreSQL connection via DATABASE_URL');
      dbInstance = new PgPoolAdapter(connStr);
    } else {
      console.log('Using embedded PostgreSQL (PGlite) with persistence');
      dbInstance = new PGliteAdapter();
    }
  }
  return dbInstance;
}

export const db = {
  query: (text, params) => getDb().query(text, params),
  exec: (sql) => getDb().exec(sql),
  connect: () => getDb().connect(),
  isEmbedded: () => getDb().isEmbedded(),
};

export default db;
