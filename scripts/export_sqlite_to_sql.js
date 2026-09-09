import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

const dbPath = path.resolve('data/pathian_ram.db');
const db = new DatabaseSync(dbPath);

const tables = ['users', 'bials', 'members', 'month_locks', 'tithes', 'financial_years'];
let sql = '-- Pathian Ram SQLite Dump for Cloudflare D1\n\n';

for (const t of tables) {
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(t);
  if (schema && schema.sql) {
    sql += `DROP TABLE IF EXISTS ${t};\n${schema.sql};\n\n`;
  }
  const rows = db.prepare(`SELECT * FROM ${t}`).all();
  for (const r of rows) {
    const keys = Object.keys(r);
    const vals = keys.map(k => {
      const v = r[k];
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number') return v;
      return `'${String(v).replace(/'/g, "''")}'`;
    });
    sql += `INSERT INTO ${t} (${keys.join(', ')}) VALUES (${vals.join(', ')});\n`;
  }
  sql += '\n';
}

fs.writeFileSync('schema_and_data.sql', sql, 'utf-8');
console.log('Successfully generated schema_and_data.sql. Size:', sql.length, 'bytes');
