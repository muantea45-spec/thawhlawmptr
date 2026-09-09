import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'pathian_ram.db');
export const db = new DatabaseSync(dbPath);

// Enable WAL mode & foreign keys for performance
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase() {
  console.log('Initializing database schema...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'BIAL')),
      bial_name TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'locked')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      code TEXT NOT NULL,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bial_id INTEGER NOT NULL,
      sl_no INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bial_id) REFERENCES bials(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS month_locks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bial_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
      is_locked INTEGER DEFAULT 0 CHECK(is_locked IN (0, 1)),
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(bial_id, year, month)
    );

    CREATE TABLE IF NOT EXISTS tithes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      bial_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
      pathian_ram REAL DEFAULT 0,
      ramthar REAL DEFAULT 0,
      tualchhung REAL DEFAULT 0,
      building REAL DEFAULT 0,
      total REAL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(member_id, year, month),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (bial_id) REFERENCES bials(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS financial_years (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default financial years if empty
  const yearCheck = db.prepare('SELECT COUNT(*) as count FROM financial_years').get();
  if (yearCheck.count === 0) {
    const defaultYears = [2024, 2025, 2026, 2027];
    const stmt = db.prepare('INSERT INTO financial_years (year) VALUES (?)');
    for (const y of defaultYears) {
      stmt.run(y);
    }
  }

  // Create default Admin account if no users exist
  const adminCheck = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1").get();
  if (!adminCheck) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('admin123', salt);
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('admin', hash, 'ADMIN');
    console.log('Default Admin created: username = "admin", password = "admin123"');
  }

  // Create default sample Bials and members if empty for quick demonstration
  const bialCheck = db.prepare('SELECT COUNT(*) as count FROM bials').get();
  if (bialCheck.count === 0) {
    console.log('Seeding initial Bials and members for demonstration...');
    const bialsList = [
      { name: 'Aizawl Venglai Bial', code: 'AZL-01' },
      { name: 'Lunglei Central Bial', code: 'LGL-01' },
      { name: 'Champhai North Bial', code: 'CHP-01' }
    ];

    for (const b of bialsList) {
      const username = b.name.toLowerCase().replace(/[^a-z0-record]/g, '').slice(0, 12) + '_user';
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync('bial123', salt);

      const uRes = db.prepare('INSERT INTO users (username, password_hash, role, bial_name) VALUES (?, ?, ?, ?)').run(username, hash, 'BIAL', b.name);
      const bRes = db.prepare('INSERT INTO bials (name, code, user_id) VALUES (?, ?, ?)').run(b.name, b.code, uRes.lastInsertRowid);
      const bialId = bRes.lastInsertRowid;

      // Seed sample members for this Bial
      const sampleNames = [
        'Lalthanpuia',
        'Zoramsanga',
        'Vanlalruati',
        'C. Laldinliana',
        'K. Lalnunfima',
        'R. Lalrintluanga',
        'Malsawmtluangi',
        'Zodingliana',
        'Lalhmachhuani',
        'T. Lalrosanga'
      ];

      sampleNames.forEach((name, idx) => {
        const mRes = db.prepare('INSERT INTO members (bial_id, sl_no, name) VALUES (?, ?, ?)').run(bialId, idx + 1, name);

        // Seed tithes for current year and previous months
        const currentYear = new Date().getFullYear();
        for (let m = 1; m <= 12; m++) {
          // Give initial tithe data for months 1-3 for demo
          if (m <= 3) {
            const pr = (idx + 1) * 500 + 1000;
            const ram = (idx + 1) * 300 + 500;
            const tual = (idx + 1) * 200 + 300;
            const bldg = (idx + 1) * 400 + 400;
            const total = pr + ram + tual + bldg;
            db.prepare(`
              INSERT INTO tithes (member_id, bial_id, year, month, pathian_ram, ramthar, tualchhung, building, total)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(mRes.lastInsertRowid, bialId, currentYear, m, pr, ram, tual, bldg, total);
          }
        }
      });
    }

    // Default lock setup: Lock months 1 and 2 for demo to show Month Lock status
    const currentYear = new Date().getFullYear();
    const firstBial = db.prepare('SELECT id FROM bials LIMIT 1').get();
    if (firstBial) {
      db.prepare('INSERT OR REPLACE INTO month_locks (bial_id, year, month, is_locked) VALUES (?, ?, ?, 1)').run(firstBial.id, currentYear, 1);
      db.prepare('INSERT OR REPLACE INTO month_locks (bial_id, year, month, is_locked) VALUES (?, ?, ?, 1)').run(firstBial.id, currentYear, 2);
    }
  }

  console.log('Database initialization complete.');
}
