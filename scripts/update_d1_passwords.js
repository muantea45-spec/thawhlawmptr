import bcrypt from 'bcryptjs';
import { execSync } from 'child_process';
import { db } from '../server/db/database.js';

const adminHash = bcrypt.hashSync('admin123', 10);
const bialHash = bcrypt.hashSync('password123', 10);

console.log('Admin Hash:', adminHash);
console.log('Bial Hash:', bialHash);

// Update local SQLite
db.prepare("UPDATE users SET password_hash = ? WHERE username = 'admin'").run(adminHash);
db.prepare("UPDATE users SET password_hash = ? WHERE role = 'BIAL'").run(bialHash);
console.log('Local SQLite passwords updated.');

// Update Cloudflare D1
const d1AdminSql = `UPDATE users SET password_hash = '${adminHash}' WHERE username = 'admin';`;
const d1BialSql = `UPDATE users SET password_hash = '${bialHash}' WHERE role = 'BIAL';`;

execSync(`npx.cmd wrangler d1 execute pathian-ram-db --remote --command "${d1AdminSql}"`, { stdio: 'inherit' });
execSync(`npx.cmd wrangler d1 execute pathian-ram-db --remote --command "${d1BialSql}"`, { stdio: 'inherit' });

console.log('Cloudflare D1 passwords updated.');
