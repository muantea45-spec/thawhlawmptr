import { db } from '../server/db/database.js';
import bcrypt from 'bcryptjs';

console.log('--- Seeding 12 Official Bials, 144 Mizo Members, and FY2026 Tithes ---');

const currentYear = 2026;

// 1. Ensure financial year 2026 exists and is active
db.prepare(`
  INSERT INTO financial_years (year, is_active)
  VALUES (2026, 1)
  ON CONFLICT(year) DO UPDATE SET is_active = 1
`).run();

// 2. Clear old demo data for clean slate (or update)
db.prepare('DELETE FROM tithes WHERE year = ?').run(currentYear);
db.prepare('DELETE FROM members WHERE year = ?').run(currentYear);
db.prepare('DELETE FROM month_locks WHERE year = ?').run(currentYear);
db.prepare('DELETE FROM bials').run();
db.prepare("DELETE FROM users WHERE role = 'BIAL'").run();

// 3. The 12 exact Bials
const bialsData = [
  { name: 'Pu Lalengzama', code: 'B1', username: 'bial1' },
  { name: 'Tv. VL Hmangaihzuala', code: 'B2', username: 'bial2' },
  { name: 'Pu F. Zodinpuia', code: 'B3', username: 'bial3' },
  { name: 'Pu Joseph Laldanmawia', code: 'B4', username: 'bial4' },
  { name: 'Pu F. Remmawia', code: 'B5', username: 'bial5' },
  { name: 'Pu F. Vanlalzauva', code: 'B6', username: 'bial6' },
  { name: 'Pu PC Lalrindika', code: 'B7', username: 'bial7' },
  { name: 'Pu FC Vanlalngaia', code: 'B8', username: 'bial8' },
  { name: 'Pu Vanlalvena Pachuau', code: 'B9', username: 'bial9' },
  { name: 'Pu HL Sangpuia', code: 'B10', username: 'bial10' },
  { name: 'Pu F. Lalchhuankima', code: 'B11', username: 'bial11' },
  { name: 'Pu C. Lalkhawngaiha', code: 'B12', username: 'bial12' }
];

// 12 Authentic Mizo Members for each Bial (12 x 12 = 144 members)
const membersByBial = [
  // Bial 1: Pu Lalengzama
  ['Lalrinsanga', 'Zonunsanga', 'Vanlalruati', 'Lalthanzuala', 'Malsawmtluanga', 'Lalmuanpuii', 'Lalremsanga', 'Lalramchhani', 'Lalhmangaiha', 'Lalrinawma', 'Laldinpuii', 'K. Lalnuntluanga'],
  // Bial 2: Tv. VL Hmangaihzuala
  ['Zothanmawia', 'H. Lalbiakdika', 'Lalnunsanga', 'R. Lalruatfela', 'Malsawmdawngliana', 'Vanlalhruaia', 'C. Lalnunmawii', 'Lalnunpuia', 'Lalawmpuia', 'Rebecca Lalhmangaihi', 'Zoramthanga', 'Lalchhandama'],
  // Bial 3: Pu F. Zodinpuia
  ['F. Lalhmachhuana', 'Vanlalpeka', 'Lalduhawma', 'Lalrinzuala', 'Melody Lalnuntluangi', 'K. Zoramchhana', 'Esther Lalremruati', 'Lalbiakzuala', 'Lalengmawia', 'David Lalruatsanga', 'Lalnunfela', 'Ruth Vanlalhruaitluangi'],
  // Bial 4: Pu Joseph Laldanmawia
  ['Joseph Laltlanhlua', 'Mary Lalbiaknungi', 'Samuel Lalhmingmawia', 'Lalrinmawia', 'Emanuel Lalduhsanga', 'Grace Lalrintluangi', 'John Lalramenga', 'Lalthlamuana', 'Lalmuanawma', 'Judy Lalrempuii', 'K. Lalrinfela', 'Lalnuntluanga Sailo'],
  // Bial 5: Pu F. Remmawia
  ['Remlalnghaka', 'F. Lalnunsiama', 'Lalrintluanga', 'Zodinpuii', 'Lalramsanga', 'Vanlalthangi', 'Lalhminghlua', 'PC Lalbiakvela', 'Deborah Lalthanpuii', 'Joshua Lalrindika', 'Lalchhuanawma', 'H. Vanlalruata'],
  // Bial 6: Pu F. Vanlalzauva
  ['Vanlalzauva Ralte', 'Lalramhluna', 'C. Zodingliana', 'Lalduhzuala', 'Hannah Lalhmingmawii', 'Jonathan Lalpekhlua', 'Lalbiakchhungi', 'R. Lalremtluanga', 'Timothy Lalmuanzuala', 'Sarah Vanlalchhani', 'Lalhmingsanga', 'K. Laldinpuia'],
  // Bial 7: Pu PC Lalrindika
  ['PC Lalmuankima', 'Lalrinpuia', 'Vanlalhriata', 'Laltanpuia', 'Abigail Lalremsiami', 'Benjamin Lalnunthara', 'Cynthia Lalthanmawii', 'Daniel Lalruatdika', 'Lalramenga', 'Eunice Lalchhandami', 'PC Laldawngliana', 'Lalnunmawia'],
  // Bial 8: Pu FC Vanlalngaia
  ['FC Lalrintluanga', 'Vanlalruatsanga', 'Lalbiaknunga', 'Lalhmunmawia', 'Dorcas Lalmuanpuii', 'Gideon Lalduhawma', 'Isaac Lalremsanga', 'Jacob Lalnunzira', 'Naomi Lalrindiki', 'FC Zoramthanga', 'Lalrinchhana', 'Vanlalfela'],
  // Bial 9: Pu Vanlalvena Pachuau
  ['Pachuau Lalhmingliana', 'Vanlalchhuanga', 'Laldanmawia', 'Lalrohlua', 'Miriam Lalramlawmi', 'Nathan Lalmuanpuia', 'Philip Lalhmachhuana', 'Rachel Lalnunsangi', 'Stephen Lalremruata', 'Thomas Lalrintluanga', 'Pachuau Vanlalhruaia', 'Lalzamliana'],
  // Bial 10: Pu HL Sangpuia
  ['HL Lalnunmawia', 'Sangzuala', 'Lalhmingthanga', 'Lalruatkima', 'Tabitha Lalbiaktluangi', 'Victor Lalpeksanga', 'William Lalduhsanga', 'Zacharia Lalrinawma', 'Andrea Lalremruati', 'HL Laltlanzova', 'Lalmalsawma', 'Vanlalpekhlua'],
  // Bial 11: Pu F. Lalchhuankima
  ['F. Lalrinpuia', 'Chhuankima Ralte', 'Lalmuanfela', 'Lalrempuia', 'Bethany Lalthanzuali', 'Caleb Lalrindika', 'Daisy Lalnunengi', 'Joel Lalhruaitluanga', 'Luke Lalbiaksanga', 'F. Laldinmawia', 'Lalhmangaihsanga', 'Vanlalmalsawma'],
  // Bial 12: Pu C. Lalkhawngaiha
  ['C. Lalramzauva', 'Khawngaihthanga', 'Lalthanmawia', 'Lalnunthara', 'Elizabeth Lalremsangi', 'Felix Lalmuanpuia', 'Gloria Lalthanpuii', 'Henry Lalrinsanga', 'Irene Lalhmangaihi', 'C. Lalchhandama', 'Lalhruaitluanga', 'Zosangliana']
];

const salt = bcrypt.genSaltSync(10);
const passwordHash = bcrypt.hashSync('password123', salt);

const insertUser = db.prepare('INSERT INTO users (username, password_hash, role, bial_name, status) VALUES (?, ?, ?, ?, ?)');
const insertBial = db.prepare('INSERT INTO bials (name, code, user_id) VALUES (?, ?, ?)');
const insertMember = db.prepare('INSERT INTO members (bial_id, year, sl_no, name) VALUES (?, ?, ?, ?)');
const insertTithe = db.prepare(`
  INSERT INTO tithes (member_id, bial_id, year, month, pathian_ram, ramthar, tualchhung, building, total)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let totalMembersCreated = 0;
let totalTithesCreated = 0;

bialsData.forEach((b, bialIdx) => {
  // Create User
  const uRes = insertUser.run(b.username, passwordHash, 'BIAL', b.name, 'active');
  const userId = uRes.lastInsertRowid;

  // Create Bial
  const bRes = insertBial.run(b.name, b.code, userId);
  const bialId = bRes.lastInsertRowid;

  // Seed 12 members
  const memberList = membersByBial[bialIdx] || [];
  memberList.forEach((memName, mIdx) => {
    const slNo = mIdx + 1;
    const mRes = insertMember.run(bialId, currentYear, slNo, memName);
    const memberId = mRes.lastInsertRowid;
    totalMembersCreated++;

    // Seed contributions for every month 1 to 12 in FY2026
    // Average total contribution between 3,000 and 9,000
    for (let month = 1; month <= 12; month++) {
      // Base contribution varying smoothly by member and month
      const randBase = Math.floor(Math.random() * (8500 - 3200 + 1)) + 3200; // 3200 to 8500
      const totalAmount = Math.round(randBase / 100) * 100;

      const pr = Math.round((totalAmount * 0.48) / 50) * 50;   // ~48%
      const ram = Math.round((totalAmount * 0.22) / 50) * 50;  // ~22%
      const tual = Math.round((totalAmount * 0.15) / 50) * 50; // ~15%
      const bldg = totalAmount - pr - ram - tual;              // remainder ~15%

      const actualTotal = pr + ram + tual + bldg;

      insertTithe.run(memberId, bialId, currentYear, month, pr, ram, tual, bldg, actualTotal);
      totalTithesCreated++;
    }
  });
});

console.log(`Successfully seeded:`);
console.log(`- 12 Bials with exact order`);
console.log(`- ${totalMembersCreated} Mizo members (12 per Bial)`);
console.log(`- ${totalTithesCreated} monthly contributions (12 months x 144 members) with average ₹3,000 - ₹9,000`);
