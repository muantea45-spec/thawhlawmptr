import bcrypt from 'bcryptjs';

const hashAdmin = '$2a$10$SNb5A34NVZMgeVPgjxbz2.YGQIeAdLsgK2OoJKLd.bS8AtEdKEe4i';
const hashBial1 = '$2a$10$q2ejXaLxbdRAgw1wonJtHuhILaU9kRvpWYRJyMkGyedWcjbZyAixO';

const passwords = ['admin', 'admin123', 'password', 'password123', 'bial1', '123456'];

console.log('--- ADMIN HASH ---');
for (const p of passwords) {
  console.log(`admin with "${p}":`, bcrypt.compareSync(p, hashAdmin));
}

console.log('--- BIAL1 HASH ---');
for (const p of passwords) {
  console.log(`bial1 with "${p}":`, bcrypt.compareSync(p, hashBial1));
}
