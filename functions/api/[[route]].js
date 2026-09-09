import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import bcrypt from 'bcryptjs';

const app = new Hono().basePath('/api');

const DEFAULT_JWT_SECRET = 'pathian_ram_tithe_super_secret_jwt_key_2026';

app.use('*', cors());

// Authentication Middleware
async function authMiddleware(c, next) {
  const authHeader = c.req.header('Authorization');
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    return c.json({ error: 'Access token required' }, 401);
  }

  try {
    const secret = c.env.JWT_SECRET || DEFAULT_JWT_SECRET;
    const payload = await verify(token, secret, 'HS256');
    c.set('user', payload);
    await next();
  } catch (err) {
    return c.json({ error: 'Invalid or expired session token' }, 401);
  }
}

function requireAdmin(c, next) {
  const user = c.get('user');
  if (user && user.role === 'ADMIN') {
    return next();
  }
  return c.json({ error: 'Admin privileges required' }, 403);
}

function requireBialUser(c, next) {
  const user = c.get('user');
  if (user && (user.role === 'BIAL' || user.role === 'ADMIN')) {
    return next();
  }
  return c.json({ error: 'Bial User authorization required' }, 403);
}

function cleanNumericInput(val) {
  if (val === null || val === undefined || val === '') return 0;
  const strVal = String(val).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(strVal)) return null;
  const parsed = parseFloat(strVal);
  return isNaN(parsed) || parsed < 0 ? null : parsed;
}

async function getActiveYear(db) {
  try {
    const row = await db.prepare('SELECT year FROM financial_years WHERE is_active = 1 LIMIT 1').first();
    return row ? row.year : new Date().getFullYear();
  } catch (e) {
    return new Date().getFullYear();
  }
}

async function isMonthLocked(db, bialId, year, month) {
  if (bialId === 'all') return false;
  const targetBialId = parseInt(bialId);
  const targetYear = parseInt(year);
  const targetMonth = parseInt(month);

  const lock = await db.prepare(
    'SELECT is_locked FROM month_locks WHERE bial_id = ? AND year = ? AND month = ?'
  ).bind(targetBialId, targetYear, targetMonth).first();

  if (lock !== null && lock !== undefined) {
    return lock.is_locked === 1;
  }

  try {
    const activeYearRow = await db.prepare('SELECT year FROM financial_years WHERE is_active = 1 LIMIT 1').first();
    if (activeYearRow && targetYear !== activeYearRow.year) {
      return true;
    }
  } catch (e) {}

  return false;
}

// ----------------------------------------------------
// AUTH ROUTES
// ----------------------------------------------------
app.post('/auth/login', async (c) => {
  const db = c.env.DB;
  const { username, password } = await c.req.json();

  if (!username || !password) {
    return c.json({ error: 'Username and password are required' }, 400);
  }

  try {
    const user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username.trim()).first();
    if (!user) {
      return c.json({ error: 'Invalid username or password' }, 401);
    }

    if (user.status === 'locked') {
      return c.json({ error: 'This account has been locked by Admin' }, 403);
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return c.json({ error: 'Invalid username or password' }, 401);
    }

    let bialDetails = null;
    if (user.role === 'BIAL') {
      bialDetails = await db.prepare('SELECT * FROM bials WHERE user_id = ?').bind(user.id).first();
    }

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      bial_name: user.bial_name,
      bial_id: bialDetails ? bialDetails.id : null,
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
    };

    const secret = c.env.JWT_SECRET || DEFAULT_JWT_SECRET;
    const token = await sign(payload, secret, 'HS256');

    return c.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        bial_name: user.bial_name,
        bial_id: bialDetails ? bialDetails.id : null
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return c.json({ error: 'Internal server error during login' }, 500);
  }
});

app.get('/auth/me', authMiddleware, async (c) => {
  const db = c.env.DB;
  const currentUser = c.get('user');

  try {
    const user = await db.prepare('SELECT id, username, role, bial_name, status FROM users WHERE id = ?').bind(currentUser.id).first();
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    let bialDetails = null;
    if (user.role === 'BIAL') {
      bialDetails = await db.prepare('SELECT * FROM bials WHERE user_id = ?').bind(user.id).first();
    }

    return c.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        bial_name: user.bial_name,
        bial_id: bialDetails ? bialDetails.id : null
      }
    });
  } catch (err) {
    return c.json({ error: 'Error fetching session profile' }, 500);
  }
});

app.put('/auth/change-password', authMiddleware, async (c) => {
  const db = c.env.DB;
  const currentUser = c.get('user');
  const { currentPassword, newPassword } = await c.req.json();

  if (!newPassword || newPassword.length < 4) {
    return c.json({ error: 'New password must be at least 4 characters long' }, 400);
  }

  try {
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(currentUser.id).first();
    if (!user) return c.json({ error: 'User not found' }, 404);

    if (currentPassword) {
      const match = bcrypt.compareSync(currentPassword, user.password_hash);
      if (!match) return c.json({ error: 'Incorrect current password' }, 400);
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(newPassword, salt);

    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, currentUser.id).run();
    return c.json({ message: 'Password changed successfully' });
  } catch (err) {
    return c.json({ error: 'Error changing password' }, 500);
  }
});

// ----------------------------------------------------
// ADMIN ROUTES
// ----------------------------------------------------
app.get('/admin/bials', authMiddleware, requireAdmin, async (c) => {
  const db = c.env.DB;
  const year = parseInt(c.req.query('year')) || await getActiveYear(db);

  try {
    const { results: bials } = await db.prepare(`
      SELECT b.id, b.name, b.code, b.user_id, u.username, u.status, u.created_at,
      (SELECT COUNT(*) FROM members m WHERE m.bial_id = b.id AND m.year = ?) as member_count,
      (SELECT COALESCE(SUM(t.total), 0) FROM tithes t WHERE t.bial_id = b.id AND t.year = ?) as total_collected
      FROM bials b
      JOIN users u ON b.user_id = u.id
      ORDER BY b.id ASC
    `).bind(year, year).all();

    bials.sort((a, b) => {
      const numA = parseInt(a.code?.replace(/\D/g, '') || a.id) || 0;
      const numB = parseInt(b.code?.replace(/\D/g, '') || b.id) || 0;
      return numA - numB;
    });

    return c.json(bials);
  } catch (err) {
    return c.json({ error: 'Failed to fetch Bials' }, 500);
  }
});

app.post('/admin/bials', authMiddleware, requireAdmin, async (c) => {
  const db = c.env.DB;
  const { name, code, username, password } = await c.req.json();

  if (!name || !code || !username || !password) {
    return c.json({ error: 'All fields (name, code, username, password) are required' }, 400);
  }

  try {
    const existingUser = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username.trim()).first();
    if (existingUser) return c.json({ error: 'Username already exists' }, 400);

    const existingBial = await db.prepare('SELECT id FROM bials WHERE name = ?').bind(name.trim()).first();
    if (existingBial) return c.json({ error: 'Bial name already exists' }, 400);

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    const userRes = await db.prepare(
      "INSERT INTO users (username, password_hash, role, bial_name, status) VALUES (?, ?, 'BIAL', ?, 'active')"
    ).bind(username.trim(), hash, name.trim()).run();

    const bialRes = await db.prepare(
      'INSERT INTO bials (name, code, user_id) VALUES (?, ?, ?)'
    ).bind(name.trim(), code.trim(), userRes.meta.last_row_id).run();

    return c.json({
      message: 'Bial account created successfully',
      bial: {
        id: bialRes.meta.last_row_id,
        name: name.trim(),
        code: code.trim(),
        username: username.trim()
      }
    }, 201);
  } catch (err) {
    return c.json({ error: 'Failed to create Bial account' }, 500);
  }
});

app.put('/admin/bials/:id', authMiddleware, requireAdmin, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const { name, code, username, password, status } = await c.req.json();

  try {
    const bial = await db.prepare('SELECT * FROM bials WHERE id = ?').bind(id).first();
    if (!bial) return c.json({ error: 'Bial not found' }, 404);

    if (name) {
      await db.prepare('UPDATE bials SET name = ? WHERE id = ?').bind(name.trim(), id).run();
      await db.prepare('UPDATE users SET bial_name = ? WHERE id = ?').bind(name.trim(), bial.user_id).run();
    }
    if (code) {
      await db.prepare('UPDATE bials SET code = ? WHERE id = ?').bind(code.trim(), id).run();
    }
    if (username) {
      await db.prepare('UPDATE users SET username = ? WHERE id = ?').bind(username.trim(), bial.user_id).run();
    }
    if (status && (status === 'active' || status === 'locked')) {
      await db.prepare('UPDATE users SET status = ? WHERE id = ?').bind(status, bial.user_id).run();
    }
    if (password && password.length > 0) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(password, salt);
      await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, bial.user_id).run();
    }

    return c.json({ message: 'Bial account updated successfully' });
  } catch (err) {
    return c.json({ error: 'Failed to update Bial' }, 500);
  }
});

app.delete('/admin/bials/:id', authMiddleware, requireAdmin, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  try {
    const bial = await db.prepare('SELECT * FROM bials WHERE id = ?').bind(id).first();
    if (!bial) return c.json({ error: 'Bial not found' }, 404);

    await db.batch([
      db.prepare('DELETE FROM tithes WHERE bial_id = ?').bind(id),
      db.prepare('DELETE FROM members WHERE bial_id = ?').bind(id),
      db.prepare('DELETE FROM month_locks WHERE bial_id = ?').bind(id),
      db.prepare('DELETE FROM bials WHERE id = ?').bind(id),
      db.prepare('DELETE FROM users WHERE id = ?').bind(bial.user_id)
    ]);

    return c.json({ message: 'Bial deleted successfully' });
  } catch (err) {
    return c.json({ error: 'Failed to delete Bial' }, 500);
  }
});

app.get('/admin/month-locks', authMiddleware, requireAdmin, async (c) => {
  const db = c.env.DB;
  const year = parseInt(c.req.query('year')) || await getActiveYear(db);

  try {
    const { results: bials } = await db.prepare('SELECT id, name, code FROM bials ORDER BY id ASC').all();
    bials.sort((a, b) => {
      const numA = parseInt(a.code?.replace(/\D/g, '') || a.id) || 0;
      const numB = parseInt(b.code?.replace(/\D/g, '') || b.id) || 0;
      return numA - numB;
    });

    const { results: locks } = await db.prepare('SELECT * FROM month_locks WHERE year = ?').bind(year).all();

    const matrix = {};
    bials.forEach(b => {
      matrix[b.id] = {};
      for (let m = 1; m <= 12; m++) {
        matrix[b.id][m] = 0;
      }
    });

    locks.forEach(l => {
      if (matrix[l.bial_id]) {
        matrix[l.bial_id][l.month] = l.is_locked;
      }
    });

    return c.json({ year, bials, matrix });
  } catch (err) {
    return c.json({ error: 'Failed to fetch month locks matrix' }, 500);
  }
});

app.post('/admin/month-locks/toggle', authMiddleware, requireAdmin, async (c) => {
  const db = c.env.DB;
  const { bial_id, year, month, is_locked, global_toggle } = await c.req.json();
  const targetYear = parseInt(year) || await getActiveYear(db);
  const targetMonth = parseInt(month);

  if (!targetMonth || targetMonth < 1 || targetMonth > 12) {
    return c.json({ error: 'Invalid month (1-12 required)' }, 400);
  }

  try {
    if (global_toggle) {
      const { results: bials } = await db.prepare('SELECT id FROM bials').all();
      const lockVal = is_locked ? 1 : 0;
      const stmts = bials.map(b =>
        db.prepare(`
          INSERT INTO month_locks (bial_id, year, month, is_locked, updated_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(bial_id, year, month) DO UPDATE SET
            is_locked = excluded.is_locked,
            updated_at = CURRENT_TIMESTAMP
        `).bind(b.id, targetYear, targetMonth, lockVal)
      );

      await db.batch(stmts);
      return c.json({ message: `Global lock for month ${targetMonth} set to ${lockVal ? 'LOCKED' : 'UNLOCKED'}` });
    } else {
      if (!bial_id) return c.json({ error: 'bial_id is required' }, 400);
      const lockVal = is_locked ? 1 : 0;
      await db.prepare(`
        INSERT INTO month_locks (bial_id, year, month, is_locked, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(bial_id, year, month) DO UPDATE SET
          is_locked = excluded.is_locked,
          updated_at = CURRENT_TIMESTAMP
      `).bind(bial_id, targetYear, targetMonth, lockVal).run();

      return c.json({ message: `Bial lock updated for month ${targetMonth}` });
    }
  } catch (err) {
    return c.json({ error: 'Failed to update month lock' }, 500);
  }
});

app.get('/admin/dashboard', authMiddleware, requireAdmin, async (c) => {
  const db = c.env.DB;
  const year = parseInt(c.req.query('year')) || await getActiveYear(db);
  const bialId = c.req.query('bial_id') && c.req.query('bial_id') !== 'all' ? parseInt(c.req.query('bial_id')) : null;
  const month = c.req.query('month') && c.req.query('month') !== 'all' ? parseInt(c.req.query('month')) : null;

  try {
    let whereClause = 'WHERE year = ?';
    const params = [year];

    if (bialId) {
      whereClause += ' AND bial_id = ?';
      params.push(bialId);
    }
    if (month) {
      whereClause += ' AND month = ?';
      params.push(month);
    }

    const grandTotals = await db.prepare(`
      SELECT
        COALESCE(SUM(pathian_ram), 0) as total_pathian_ram,
        COALESCE(SUM(ramthar), 0) as total_ramthar,
        COALESCE(SUM(tualchhung), 0) as total_tualchhung,
        COALESCE(SUM(building), 0) as total_building,
        COALESCE(SUM(total), 0) as grand_total
      FROM tithes
      ${whereClause}
    `).bind(...params).first();

    let bialWhere = '';
    const subParams = [year];
    if (month) subParams.push(month);

    const mainParams = [year];
    if (month) mainParams.push(month);

    if (bialId) {
      bialWhere = 'WHERE b.id = ?';
    }

    const monthFilterTithe = month ? 'AND t.month = ?' : '';
    const monthFilterT2 = month ? 'AND t2.month = ?' : '';

    const queryParams = [...subParams, ...mainParams];
    if (bialId) queryParams.push(bialId);

    const { results: rawBialBreakdown } = await db.prepare(`
      SELECT
        b.id,
        b.name,
        b.code,
        COALESCE(SUM(t.pathian_ram), 0) as pathian_ram,
        COALESCE(SUM(t.ramthar), 0) as ramthar,
        COALESCE(SUM(t.tualchhung), 0) as tualchhung,
        COALESCE(SUM(building), 0) as building,
        COALESCE(SUM(t.total), 0) as total,
        (SELECT COUNT(*) FROM members m WHERE m.bial_id = b.id AND m.year = ${year}) as total_members,
        (SELECT COUNT(DISTINCT t2.member_id) FROM tithes t2 WHERE t2.bial_id = b.id AND t2.year = ? ${monthFilterT2} AND t2.total > 0) as returned_members
      FROM bials b
      LEFT JOIN tithes t ON b.id = t.bial_id AND t.year = ? ${monthFilterTithe}
      ${bialWhere}
      GROUP BY b.id
      ORDER BY total DESC, b.name ASC
    `).bind(...queryParams).all();

    const grandTotalVal = grandTotals?.grand_total || 0;

    const bialBreakdown = rawBialBreakdown.map(b => {
      const return_rate = b.total_members > 0 ? Math.round((b.returned_members / b.total_members) * 1000) / 10 : 0;
      const percentage_share = grandTotalVal > 0 ? Math.round((b.total / grandTotalVal) * 1000) / 10 : 0;
      const avg_per_member = b.returned_members > 0 ? Math.round(b.total / b.returned_members) : 0;
      return {
        ...b,
        return_rate,
        percentage_share,
        avg_per_member
      };
    });

    bialBreakdown.sort((a, b) => {
      const numA = parseInt(a.code?.replace(/\D/g, '') || a.id) || 0;
      const numB = parseInt(b.code?.replace(/\D/g, '') || b.id) || 0;
      return numA - numB;
    });

    let memberCountWhere = 'WHERE year = ?';
    const memberCountParams = [year];
    if (bialId) {
      memberCountWhere += ' AND bial_id = ?';
      memberCountParams.push(bialId);
    }
    const systemMembersRes = await db.prepare(`SELECT COUNT(*) as count FROM members ${memberCountWhere}`).bind(...memberCountParams).first();
    const total_system_members = systemMembersRes?.count || 0;

    const returnedMembersRes = await db.prepare(`
      SELECT COUNT(DISTINCT member_id) as count
      FROM tithes
      ${whereClause} AND (pathian_ram > 0 OR ramthar > 0 OR tualchhung > 0 OR building > 0 OR total > 0)
    `).bind(...params).first();
    const total_returned_members = returnedMembersRes?.count || 0;

    const overall_return_rate = total_system_members > 0 
      ? Math.round((total_returned_members / total_system_members) * 1000) / 10 
      : 0;

    const avg_contribution_per_member = total_returned_members > 0 
      ? Math.round(grandTotalVal / total_returned_members) 
      : 0;

    const topContributingBial = bialBreakdown.length > 0 && bialBreakdown[0].total > 0
      ? {
          id: bialBreakdown[0].id,
          name: bialBreakdown[0].name,
          code: bialBreakdown[0].code,
          total: bialBreakdown[0].total,
          percentage_share: bialBreakdown[0].percentage_share,
          returned_members: bialBreakdown[0].returned_members,
          total_members: bialBreakdown[0].total_members,
          return_rate: bialBreakdown[0].return_rate
        }
      : null;

    const enrichedGrandTotals = {
      ...grandTotals,
      total_system_members,
      total_returned_members,
      pending_members: Math.max(0, total_system_members - total_returned_members),
      overall_return_rate,
      avg_contribution_per_member,
      top_contributing_bial: topContributingBial
    };

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyTrends = [];

    for (let m = 1; m <= 12; m++) {
      let mWhere = 'WHERE year = ? AND month = ?';
      const mParams = [year, m];
      if (bialId) {
        mWhere += ' AND bial_id = ?';
        mParams.push(bialId);
      }

      const mData = await db.prepare(`
        SELECT
          COALESCE(SUM(pathian_ram), 0) as pathian_ram,
          COALESCE(SUM(ramthar), 0) as ramthar,
          COALESCE(SUM(tualchhung), 0) as tualchhung,
          COALESCE(SUM(building), 0) as building,
          COALESCE(SUM(total), 0) as total,
          COUNT(DISTINCT CASE WHEN (pathian_ram > 0 OR ramthar > 0 OR tualchhung > 0 OR building > 0 OR total > 0) THEN member_id END) as returned_members
        FROM tithes
        ${mWhere}
      `).bind(...mParams).first();

      const returnedCount = mData?.returned_members || 0;
      const mReturnRate = total_system_members > 0 
        ? Math.round((returnedCount / total_system_members) * 1000) / 10 
        : 0;

      monthlyTrends.push({
        month: monthNames[m - 1],
        monthNum: m,
        ...mData,
        returned_members: returnedCount,
        return_rate: mReturnRate,
        total_system_members
      });
    }

    return c.json({
      year,
      grandTotals: enrichedGrandTotals,
      bialBreakdown,
      monthlyTrends,
      filteredBialId: bialId,
      filteredMonth: month
    });
  } catch (err) {
    return c.json({ error: 'Failed to fetch admin stats' }, 500);
  }
});

app.get('/admin/years', authMiddleware, requireAdmin, async (c) => {
  const db = c.env.DB;
  try {
    const { results: rows } = await db.prepare('SELECT id, year, is_active FROM financial_years ORDER BY year ASC').all();
    const years = rows.map(r => r.year);
    const activeRow = rows.find(r => r.is_active === 1) || rows[rows.length - 1];
    const activeYear = activeRow ? activeRow.year : new Date().getFullYear();

    return c.json({
      years: years.length > 0 ? years : [2024, 2025, 2026, 2027],
      yearDetails: rows,
      activeYear
    });
  } catch (err) {
    return c.json({ error: 'Failed to fetch financial years' }, 500);
  }
});

app.put('/admin/years/active', authMiddleware, requireAdmin, async (c) => {
  const db = c.env.DB;
  const { year } = await c.req.json();
  const numYear = parseInt(year);

  if (isNaN(numYear)) {
    return c.json({ error: 'Valid financial year is required' }, 400);
  }

  try {
    const existing = await db.prepare('SELECT id FROM financial_years WHERE year = ?').bind(numYear).first();
    if (!existing) {
      return c.json({ error: `Financial Year ${numYear} not found` }, 404);
    }

    await db.prepare('UPDATE financial_years SET is_active = CASE WHEN year = ? THEN 1 ELSE 0 END').bind(numYear).run();
    return c.json({ message: `Financial Year ${numYear} is now the active financial year`, activeYear: numYear });
  } catch (err) {
    return c.json({ error: 'Failed to set active financial year' }, 500);
  }
});

app.post('/admin/years', authMiddleware, requireAdmin, async (c) => {
  const db = c.env.DB;
  const { year, set_active } = await c.req.json();
  const numYear = parseInt(year);

  if (isNaN(numYear) || numYear < 2000 || numYear > 2100) {
    return c.json({ error: 'Valid 4-digit financial year required (e.g., 2026)' }, 400);
  }

  try {
    const existing = await db.prepare('SELECT id FROM financial_years WHERE year = ?').bind(numYear).first();
    if (existing) {
      return c.json({ error: `Financial Year ${numYear} already exists` }, 400);
    }

    const isActiveVal = set_active ? 1 : 0;
    if (isActiveVal === 1) {
      await db.prepare('UPDATE financial_years SET is_active = 0').run();
    }

    await db.prepare('INSERT INTO financial_years (year, is_active) VALUES (?, ?)').bind(numYear, isActiveVal).run();
    return c.json({ message: `Financial Year ${numYear} added successfully`, year: numYear, is_active: isActiveVal }, 201);
  } catch (err) {
    return c.json({ error: 'Failed to add financial year' }, 500);
  }
});

app.delete('/admin/years/:year', authMiddleware, requireAdmin, async (c) => {
  const db = c.env.DB;
  const numYear = parseInt(c.req.param('year'));
  if (isNaN(numYear)) return c.json({ error: 'Invalid financial year' }, 400);

  try {
    const countRes = await db.prepare('SELECT COUNT(*) as count FROM financial_years').first();
    if (countRes.count <= 1) {
      return c.json({ error: 'Cannot delete the last remaining Financial Year' }, 400);
    }

    const yearToDelete = await db.prepare('SELECT is_active FROM financial_years WHERE year = ?').bind(numYear).first();
    await db.prepare('DELETE FROM financial_years WHERE year = ?').bind(numYear).run();

    if (yearToDelete && yearToDelete.is_active === 1) {
      const latest = await db.prepare('SELECT id FROM financial_years ORDER BY year DESC LIMIT 1').first();
      if (latest) {
        await db.prepare('UPDATE financial_years SET is_active = 1 WHERE id = ?').bind(latest.id).run();
      }
    }

    return c.json({ message: `Financial Year ${numYear} deleted successfully` });
  } catch (err) {
    return c.json({ error: 'Failed to delete financial year' }, 500);
  }
});

app.get('/admin/overall-member-contributions', authMiddleware, requireAdmin, async (c) => {
  const db = c.env.DB;
  const year = parseInt(c.req.query('year')) || await getActiveYear(db);

  try {
    const { results: bials } = await db.prepare('SELECT id, name, code FROM bials ORDER BY id ASC').all();
    bials.sort((a, b) => {
      const numA = parseInt(a.code?.replace(/\D/g, '') || a.id) || 0;
      const numB = parseInt(b.code?.replace(/\D/g, '') || b.id) || 0;
      return numA - numB;
    });

    const data = [];
    let churchPR = 0, churchRT = 0, churchTch = 0, churchBldg = 0, churchTotal = 0;
    let totalMemberCount = 0;

    for (const b of bials) {
      const { results: members } = await db.prepare(`
        SELECT
          m.id as member_id,
          m.sl_no,
          m.name as member_name,
          COALESCE(SUM(t.pathian_ram), 0) as total_pathian_ram,
          COALESCE(SUM(t.ramthar), 0) as total_ramthar,
          COALESCE(SUM(t.tualchhung), 0) as total_tualchhung,
          COALESCE(SUM(t.building), 0) as total_building,
          COALESCE(SUM(t.total), 0) as grand_total
        FROM members m
        LEFT JOIN tithes t ON m.id = t.member_id AND t.year = ?
        WHERE m.bial_id = ? AND m.year = ?
        GROUP BY m.id
        ORDER BY m.sl_no ASC, m.id ASC
      `).bind(year, b.id, year).all();

      let bialPR = 0, bialRT = 0, bialTch = 0, bialBldg = 0, bialTotal = 0;
      members.forEach(m => {
        bialPR += m.total_pathian_ram;
        bialRT += m.total_ramthar;
        bialTch += m.total_tualchhung;
        bialBldg += m.total_building;
        bialTotal += m.grand_total;
      });

      churchPR += bialPR;
      churchRT += bialRT;
      churchTch += bialTch;
      churchBldg += bialBldg;
      churchTotal += bialTotal;
      totalMemberCount += members.length;

      data.push({
        bial_id: b.id,
        bial_name: b.name,
        bial_code: b.code,
        members,
        subtotal: {
          total_pathian_ram: bialPR,
          total_ramthar: bialRT,
          total_tualchhung: bialTch,
          total_building: bialBldg,
          grand_total: bialTotal
        }
      });
    }

    return c.json({
      year,
      totalMemberCount,
      bials: data,
      churchGrandTotal: {
        total_pathian_ram: churchPR,
        total_ramthar: churchRT,
        total_tualchhung: churchTch,
        total_building: churchBldg,
        grand_total: churchTotal
      }
    });
  } catch (err) {
    return c.json({ error: 'Failed to fetch overall member contributions' }, 500);
  }
});

app.get('/admin/members/all', authMiddleware, requireAdmin, async (c) => {
  const db = c.env.DB;
  const year = parseInt(c.req.query('year'));

  try {
    let query = `
      SELECT 
        m.id, 
        m.bial_id, 
        m.year,
        m.sl_no, 
        m.name, 
        b.name as bial_name, 
        b.code as bial_code,
        (SELECT COUNT(*) FROM tithes t WHERE t.member_id = m.id) as tithe_records_count,
        (SELECT COALESCE(SUM(total), 0) FROM tithes t WHERE t.member_id = m.id) as total_contributed
      FROM members m
      JOIN bials b ON m.bial_id = b.id
    `;
    const params = [];
    if (year && !isNaN(year)) {
      query += ` WHERE m.year = ?`;
      params.push(year);
    }
    query += ` ORDER BY b.name ASC, m.sl_no ASC, m.id ASC`;

    const { results: members } = await db.prepare(query).bind(...params).all();
    return c.json(members);
  } catch (err) {
    return c.json({ error: 'Failed to fetch all members' }, 500);
  }
});

app.post('/admin/members/transfer', authMiddleware, requireAdmin, async (c) => {
  const db = c.env.DB;
  const { member_id, target_bial_id, new_sl_no } = await c.req.json();
  const memberId = parseInt(member_id);
  const targetBialId = parseInt(target_bial_id);

  if (!memberId || isNaN(memberId) || !targetBialId || isNaN(targetBialId)) {
    return c.json({ error: 'Valid member_id and target_bial_id are required' }, 400);
  }

  try {
    const member = await db.prepare('SELECT * FROM members WHERE id = ?').bind(memberId).first();
    if (!member) return c.json({ error: 'Member not found' }, 404);

    const sourceBial = await db.prepare('SELECT id, name, code FROM bials WHERE id = ?').bind(member.bial_id).first();
    const destinationBial = await db.prepare('SELECT id, name, code FROM bials WHERE id = ?').bind(targetBialId).first();

    if (!destinationBial) return c.json({ error: 'Destination Bial not found' }, 404);
    if (member.bial_id === targetBialId) {
      return c.json({ error: `Member "${member.name}" is already in ${destinationBial.name}` }, 400);
    }

    let assignedSlNo = parseInt(new_sl_no);
    if (isNaN(assignedSlNo) || assignedSlNo <= 0) {
      const maxSl = await db.prepare('SELECT COALESCE(MAX(sl_no), 0) as max_sl FROM members WHERE bial_id = ?').bind(targetBialId).first();
      assignedSlNo = (maxSl ? maxSl.max_sl : 0) + 1;
    }

    await db.batch([
      db.prepare('UPDATE members SET bial_id = ?, sl_no = ? WHERE id = ?').bind(targetBialId, assignedSlNo, memberId),
      db.prepare('UPDATE tithes SET bial_id = ? WHERE member_id = ?').bind(targetBialId, memberId)
    ]);

    return c.json({
      message: `Member "${member.name}" successfully transferred from ${sourceBial?.name || 'Previous Bial'} to ${destinationBial.name}!`,
      member: {
        id: memberId,
        name: member.name,
        previous_bial_id: member.bial_id,
        previous_bial_name: sourceBial?.name,
        new_bial_id: targetBialId,
        new_bial_name: destinationBial.name,
        sl_no: assignedSlNo
      }
    });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to transfer member' }, 500);
  }
});

// ----------------------------------------------------
// MEMBERS ROUTES
// ----------------------------------------------------
function getTargetBialId(c) {
  const user = c.get('user');
  if (user.role === 'ADMIN') {
    const qVal = c.req.query('bial_id');
    if (qVal === 'all') return 'all';
    return qVal ? parseInt(qVal) : 'all';
  }
  return user.bial_id;
}

app.get('/members', authMiddleware, requireBialUser, async (c) => {
  const db = c.env.DB;
  const bialId = getTargetBialId(c);
  const year = parseInt(c.req.query('year')) || await getActiveYear(db);

  if (!bialId) {
    return c.json({ error: 'bial_id is required' }, 400);
  }

  try {
    let members;
    if (bialId === 'all') {
      const res = await db.prepare(`
        SELECT m.id, m.bial_id, m.year, m.sl_no, m.name, m.created_at, b.name as bial_name, b.code as bial_code
        FROM members m
        JOIN bials b ON m.bial_id = b.id
        WHERE m.year = ?
        ORDER BY b.name ASC, m.sl_no ASC, m.id ASC
      `).bind(year).all();
      members = res.results;
    } else {
      const res = await db.prepare(`
        SELECT id, bial_id, year, sl_no, name, created_at
        FROM members
        WHERE bial_id = ? AND year = ?
        ORDER BY sl_no ASC, id ASC
      `).bind(bialId, year).all();
      members = res.results;
    }

    return c.json(members);
  } catch (err) {
    return c.json({ error: 'Failed to fetch members' }, 500);
  }
});

app.post('/members', authMiddleware, requireBialUser, async (c) => {
  const db = c.env.DB;
  const body = await c.req.json();
  const user = c.get('user');
  const bialId = user.role === 'ADMIN' ? parseInt(body.bial_id || c.req.query('bial_id')) : user.bial_id;
  const year = parseInt(body.year) || await getActiveYear(db);
  const name = body.name;
  const sl_no = body.sl_no;

  if (!bialId || isNaN(bialId)) {
    return c.json({ error: 'Specific bial_id is required' }, 400);
  }

  if (!name || name.trim().length === 0) {
    return c.json({ error: 'Member name (HMING) is required' }, 400);
  }

  try {
    let nextSlNo = parseInt(sl_no);
    if (!nextSlNo || isNaN(nextSlNo)) {
      const maxSl = await db.prepare('SELECT MAX(sl_no) as max_sl FROM members WHERE bial_id = ? AND year = ?').bind(bialId, year).first();
      nextSlNo = (maxSl && maxSl.max_sl) ? maxSl.max_sl + 1 : 1;
    }

    const result = await db.prepare(`
      INSERT INTO members (bial_id, year, sl_no, name)
      VALUES (?, ?, ?, ?)
    `).bind(bialId, year, nextSlNo, name.trim()).run();

    return c.json({
      message: 'Member added successfully',
      member: {
        id: result.meta.last_row_id,
        bial_id: bialId,
        year,
        sl_no: nextSlNo,
        name: name.trim()
      }
    }, 201);
  } catch (err) {
    return c.json({ error: 'Failed to add member' }, 500);
  }
});

app.post('/members/rollover', authMiddleware, requireBialUser, async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const body = await c.req.json();
  const sourceYear = parseInt(body.source_year);
  const targetYear = parseInt(body.target_year);

  if (!sourceYear || !targetYear || isNaN(sourceYear) || isNaN(targetYear)) {
    return c.json({ error: 'Valid source_year and target_year are required' }, 400);
  }

  if (sourceYear === targetYear) {
    return c.json({ error: 'Source and target financial years must be different' }, 400);
  }

  let targetBialId;
  if (user.role === 'ADMIN') {
    targetBialId = body.bial_id === 'all' || !body.bial_id ? 'all' : parseInt(body.bial_id);
  } else {
    targetBialId = user.bial_id;
  }

  try {
    let sourceMembers;
    if (targetBialId === 'all') {
      const res = await db.prepare(`
        SELECT bial_id, sl_no, name
        FROM members
        WHERE year = ?
        ORDER BY bial_id ASC, sl_no ASC, id ASC
      `).bind(sourceYear).all();
      sourceMembers = res.results;
    } else {
      const res = await db.prepare(`
        SELECT bial_id, sl_no, name
        FROM members
        WHERE bial_id = ? AND year = ?
        ORDER BY sl_no ASC, id ASC
      `).bind(targetBialId, sourceYear).all();
      sourceMembers = res.results;
    }

    if (sourceMembers.length === 0) {
      return c.json({ error: `No members found in FY ${sourceYear} to rollover.` }, 400);
    }

    const { results: existingMembers } = await db.prepare(
      'SELECT bial_id, LOWER(name) as name_lower FROM members WHERE year = ?'
    ).bind(targetYear).all();

    const existingSet = new Set(existingMembers.map(e => `${e.bial_id}_${e.name_lower}`));

    const insertStmts = [];
    let rolledOverCount = 0;
    let skippedCount = 0;

    for (const m of sourceMembers) {
      const key = `${m.bial_id}_${m.name.trim().toLowerCase()}`;
      if (!existingSet.has(key)) {
        insertStmts.push(
          db.prepare('INSERT INTO members (bial_id, year, sl_no, name) VALUES (?, ?, ?, ?)').bind(m.bial_id, targetYear, m.sl_no, m.name.trim())
        );
        existingSet.add(key);
        rolledOverCount++;
      } else {
        skippedCount++;
      }
    }

    if (insertStmts.length > 0) {
      // Chunk batch operations if large (D1 supports up to 100 statements per batch)
      const chunkSize = 80;
      for (let i = 0; i < insertStmts.length; i += chunkSize) {
        await db.batch(insertStmts.slice(i, i + chunkSize));
      }
    }

    return c.json({
      success: true,
      message: `Successfully rolled over ${rolledOverCount} member name(s) from FY ${sourceYear} to FY ${targetYear}.${skippedCount > 0 ? ` (${skippedCount} already existed).` : ''}`,
      rolled_over_count: rolledOverCount,
      skipped_count: skippedCount,
      total_source_members: sourceMembers.length,
      source_year: sourceYear,
      target_year: targetYear
    });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to rollover members' }, 500);
  }
});

app.put('/members/:id', authMiddleware, requireBialUser, async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const id = c.req.param('id');
  const { name, sl_no } = await c.req.json();

  try {
    const member = await db.prepare('SELECT * FROM members WHERE id = ?').bind(id).first();
    if (!member) return c.json({ error: 'Member not found' }, 404);

    if (user.role === 'BIAL' && member.bial_id !== user.bial_id) {
      return c.json({ error: 'Unauthorized to modify member of another Bial' }, 403);
    }

    if (name && name.trim().length > 0) {
      await db.prepare('UPDATE members SET name = ? WHERE id = ?').bind(name.trim(), id).run();
    }

    if (sl_no !== undefined && !isNaN(parseInt(sl_no))) {
      await db.prepare('UPDATE members SET sl_no = ? WHERE id = ?').bind(parseInt(sl_no), id).run();
    }

    return c.json({ message: 'Member updated successfully' });
  } catch (err) {
    return c.json({ error: 'Failed to update member' }, 500);
  }
});

app.delete('/members/:id', authMiddleware, requireBialUser, async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const id = c.req.param('id');

  try {
    const member = await db.prepare('SELECT * FROM members WHERE id = ?').bind(id).first();
    if (!member) return c.json({ error: 'Member not found' }, 404);

    if (user.role === 'BIAL' && member.bial_id !== user.bial_id) {
      return c.json({ error: 'Unauthorized to delete member of another Bial' }, 403);
    }

    await db.batch([
      db.prepare('DELETE FROM tithes WHERE member_id = ?').bind(id),
      db.prepare('DELETE FROM members WHERE id = ?').bind(id)
    ]);

    return c.json({ message: 'Member deleted successfully' });
  } catch (err) {
    return c.json({ error: 'Failed to delete member' }, 500);
  }
});

// ----------------------------------------------------
// TITHES ROUTES
// ----------------------------------------------------
app.get('/tithes', authMiddleware, requireBialUser, async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const reqBialId = c.req.query('bial_id');
  const bialId = user.role === 'ADMIN' ? (reqBialId === 'all' ? 'all' : (parseInt(reqBialId) || 'all')) : user.bial_id;
  const year = parseInt(c.req.query('year')) || await getActiveYear(db);
  const month = parseInt(c.req.query('month')) || (new Date().getMonth() + 1);

  if (!bialId) return c.json({ error: 'bial_id is required' }, 400);

  try {
    const isAll = bialId === 'all';
    const locked = isAll ? false : await isMonthLocked(db, bialId, year, month);

    let rows;
    if (isAll) {
      const { results: allBials } = await db.prepare('SELECT id, name, code FROM bials').all();
      allBials.sort((a, b) => {
        const numA = parseInt(a.code?.replace(/\D/g, '') || a.id) || 0;
        const numB = parseInt(b.code?.replace(/\D/g, '') || b.id) || 0;
        return numA - numB;
      });

      const { results: rawRows } = await db.prepare(`
        SELECT
          m.id as member_id,
          m.bial_id,
          b.name as bial_name,
          b.code as bial_code,
          m.sl_no,
          m.name,
          COALESCE(t.id, 0) as tithe_id,
          COALESCE(t.pathian_ram, 0) as pathian_ram,
          COALESCE(t.ramthar, 0) as ramthar,
          COALESCE(t.tualchhung, 0) as tualchhung,
          COALESCE(t.building, 0) as building,
          COALESCE(t.total, 0) as total
        FROM members m
        JOIN bials b ON m.bial_id = b.id
        LEFT JOIN tithes t ON m.id = t.member_id AND t.year = ? AND t.month = ?
        WHERE m.year = ?
      `).bind(year, month, year).all();

      const bialOrderMap = new Map();
      allBials.forEach((b, idx) => bialOrderMap.set(b.id, idx));

      rawRows.sort((a, b) => {
        const orderA = bialOrderMap.has(a.bial_id) ? bialOrderMap.get(a.bial_id) : 999;
        const orderB = bialOrderMap.has(b.bial_id) ? bialOrderMap.get(b.bial_id) : 999;
        if (orderA !== orderB) return orderA - orderB;
        if ((a.sl_no || 0) !== (b.sl_no || 0)) return (a.sl_no || 0) - (b.sl_no || 0);
        return a.member_id - b.member_id;
      });

      rows = rawRows.map((m, index) => ({
        ...m,
        original_sl_no: m.sl_no,
        global_sl_no: index + 1,
        display_sl_no: index + 1,
        sl_no: index + 1
      }));
    } else {
      const { results: bialRows } = await db.prepare(`
        SELECT
          m.id as member_id,
          m.bial_id,
          b.name as bial_name,
          b.code as bial_code,
          m.sl_no,
          m.name,
          COALESCE(t.id, 0) as tithe_id,
          COALESCE(t.pathian_ram, 0) as pathian_ram,
          COALESCE(t.ramthar, 0) as ramthar,
          COALESCE(t.tualchhung, 0) as tualchhung,
          COALESCE(t.building, 0) as building,
          COALESCE(t.total, 0) as total
        FROM members m
        JOIN bials b ON m.bial_id = b.id
        LEFT JOIN tithes t ON m.id = t.member_id AND t.year = ? AND t.month = ?
        WHERE m.bial_id = ? AND m.year = ?
        ORDER BY m.sl_no ASC, m.id ASC
      `).bind(year, month, bialId, year).all();
      rows = bialRows;
    }

    let sumPathianRam = 0, sumRamthar = 0, sumTualchhung = 0, sumBuilding = 0, grandTotal = 0;
    rows.forEach(r => {
      sumPathianRam += r.pathian_ram;
      sumRamthar += r.ramthar;
      sumTualchhung += r.tualchhung;
      sumBuilding += r.building;
      grandTotal += r.total;
    });

    return c.json({
      bial_id: bialId,
      year,
      month,
      is_locked: locked,
      members: rows,
      summary: {
        sum_pathian_ram: sumPathianRam,
        sum_ramthar: sumRamthar,
        sum_tualchhung: sumTualchhung,
        sum_building: sumBuilding,
        grand_total: grandTotal
      }
    });
  } catch (err) {
    return c.json({ error: 'Failed to fetch tithe records' }, 500);
  }
});

app.post('/tithes/upsert', authMiddleware, requireBialUser, async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const body = await c.req.json();
  const bialId = user.role === 'ADMIN' ? (parseInt(body.bial_id) || user.bial_id) : user.bial_id;
  const { member_id, year, month, pathian_ram, ramthar, tualchhung, building } = body;

  if (!bialId || !member_id || !year || !month) {
    return c.json({ error: 'Missing required parameters' }, 400);
  }

  const locked = await isMonthLocked(db, bialId, year, month);
  if (locked && user.role !== 'ADMIN') {
    return c.json({ error: 'Month Locked by Admin. Data entry and edits are restricted.' }, 403);
  }

  const pr = cleanNumericInput(pathian_ram);
  const ram = cleanNumericInput(ramthar);
  const tual = cleanNumericInput(tualchhung);
  const bldg = cleanNumericInput(building);

  if (pr === null || ram === null || tual === null || bldg === null) {
    return c.json({ error: 'Invalid numeric value. Financial entries accept DIGITS ONLY (non-negative numbers).' }, 400);
  }

  const rowTotal = pr + ram + tual + bldg;

  try {
    await db.prepare(`
      INSERT INTO tithes (member_id, bial_id, year, month, pathian_ram, ramthar, tualchhung, building, total, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(member_id, year, month) DO UPDATE SET
        pathian_ram = excluded.pathian_ram,
        ramthar = excluded.ramthar,
        tualchhung = excluded.tualchhung,
        building = excluded.building,
        total = excluded.total,
        updated_at = CURRENT_TIMESTAMP
    `).bind(member_id, bialId, year, month, pr, ram, tual, bldg, rowTotal).run();

    return c.json({
      message: 'Tithe entry saved successfully',
      entry: { member_id, year, month, pathian_ram: pr, ramthar: ram, tualchhung: tual, building: bldg, total: rowTotal }
    });
  } catch (err) {
    return c.json({ error: 'Failed to save tithe entry' }, 500);
  }
});

app.post('/tithes/bulk-upsert', authMiddleware, requireBialUser, async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const body = await c.req.json();
  const bialId = user.role === 'ADMIN' ? (parseInt(body.bial_id) || user.bial_id) : user.bial_id;
  const { entries, year, month } = body;

  if (!bialId || !year || !month || !Array.isArray(entries)) {
    return c.json({ error: 'Invalid payload for bulk save' }, 400);
  }

  const locked = await isMonthLocked(db, bialId, year, month);
  if (locked && user.role !== 'ADMIN') {
    return c.json({ error: 'Month Locked by Admin. Edits are not allowed.' }, 403);
  }

  try {
    const stmts = entries.map(item => {
      const pr = cleanNumericInput(item.pathian_ram) || 0;
      const ram = cleanNumericInput(item.ramthar) || 0;
      const tual = cleanNumericInput(item.tualchhung) || 0;
      const bldg = cleanNumericInput(item.building) || 0;
      const rowTotal = pr + ram + tual + bldg;

      return db.prepare(`
        INSERT INTO tithes (member_id, bial_id, year, month, pathian_ram, ramthar, tualchhung, building, total, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(member_id, year, month) DO UPDATE SET
          pathian_ram = excluded.pathian_ram,
          ramthar = excluded.ramthar,
          tualchhung = excluded.tualchhung,
          building = excluded.building,
          total = excluded.total,
          updated_at = CURRENT_TIMESTAMP
      `).bind(item.member_id, bialId, year, month, pr, ram, tual, bldg, rowTotal);
    });

    const chunkSize = 80;
    for (let i = 0; i < stmts.length; i += chunkSize) {
      await db.batch(stmts.slice(i, i + chunkSize));
    }

    return c.json({ message: 'Bulk tithes saved successfully' });
  } catch (err) {
    return c.json({ error: 'Failed to complete bulk save' }, 500);
  }
});

app.get('/tithes/yearly-summary', authMiddleware, requireBialUser, async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const reqBialId = c.req.query('bial_id');
  const bialId = user.role === 'ADMIN' ? (parseInt(reqBialId) || user.bial_id) : user.bial_id;
  const year = parseInt(c.req.query('year')) || await getActiveYear(db);

  if (!bialId) return c.json({ error: 'bial_id is required' }, 400);

  try {
    const bial = await db.prepare('SELECT id, name, code FROM bials WHERE id = ?').bind(bialId).first();
    if (!bial) return c.json({ error: 'Bial not found' }, 404);

    const financialMonthOrder = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
    const monthNames = {
      1: 'January', 2: 'February', 3: 'March', 4: 'April', 5: 'May', 6: 'June',
      7: 'July', 8: 'August', 9: 'September', 10: 'October', 11: 'November', 12: 'December'
    };

    const monthlyBreakdown = [];
    for (const m of financialMonthOrder) {
      const locked = await isMonthLocked(db, bialId, year, m);
      const row = await db.prepare(`
        SELECT
          COALESCE(SUM(pathian_ram), 0) as pathian_ram,
          COALESCE(SUM(ramthar), 0) as ramthar,
          COALESCE(SUM(tualchhung), 0) as tualchhung,
          COALESCE(SUM(building), 0) as building,
          COALESCE(SUM(total), 0) as total
        FROM tithes
        WHERE bial_id = ? AND year = ? AND month = ?
      `).bind(bialId, year, m).first();

      monthlyBreakdown.push({
        month: m,
        month_name: monthNames[m],
        is_locked: locked ? 1 : 0,
        ...row
      });
    }

    const { results: memberTotals } = await db.prepare(`
      SELECT
        m.id as member_id,
        m.sl_no,
        m.name,
        COALESCE(SUM(t.pathian_ram), 0) as total_pathian_ram,
        COALESCE(SUM(t.ramthar), 0) as total_ramthar,
        COALESCE(SUM(t.tualchhung), 0) as total_tualchhung,
        COALESCE(SUM(building), 0) as total_building,
        COALESCE(SUM(t.total), 0) as grand_total
      FROM members m
      LEFT JOIN tithes t ON m.id = t.member_id AND t.year = ?
      WHERE m.bial_id = ? AND m.year = ?
      GROUP BY m.id
      ORDER BY m.sl_no ASC, m.id ASC
    `).bind(year, bialId, year).all();

    const grandTotals = await db.prepare(`
      SELECT
        COALESCE(SUM(pathian_ram), 0) as total_pathian_ram,
        COALESCE(SUM(ramthar), 0) as total_ramthar,
        COALESCE(SUM(tualchhung), 0) as total_tualchhung,
        COALESCE(SUM(building), 0) as total_building,
        COALESCE(SUM(total), 0) as grand_total
      FROM tithes
      WHERE bial_id = ? AND year = ?
    `).bind(bialId, year).first();

    return c.json({
      bial,
      year,
      monthlyBreakdown,
      memberTotals,
      grandTotals
    });
  } catch (err) {
    return c.json({ error: 'Failed to fetch yearly summary' }, 500);
  }
});

app.get('/tithes/member-history', authMiddleware, requireBialUser, async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const memberId = parseInt(c.req.query('member_id'));
  const year = parseInt(c.req.query('year')) || await getActiveYear(db);

  if (!memberId) return c.json({ error: 'member_id is required' }, 400);

  try {
    const member = await db.prepare(`
      SELECT m.id, m.sl_no, m.name, m.bial_id, b.name as bial_name, b.code as bial_code
      FROM members m
      JOIN bials b ON m.bial_id = b.id
      WHERE m.id = ?
    `).bind(memberId).first();

    if (!member) return c.json({ error: 'Member not found' }, 404);

    if (user.role !== 'ADMIN' && user.bial_id !== member.bial_id) {
      return c.json({ error: 'Access denied to member outside your Bial' }, 403);
    }

    const financialMonthOrder = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
    const monthNames = {
      1: 'January', 2: 'February', 3: 'March', 4: 'April', 5: 'May', 6: 'June',
      7: 'July', 8: 'August', 9: 'September', 10: 'October', 11: 'November', 12: 'December'
    };

    const monthlyEntries = [];
    for (const m of financialMonthOrder) {
      const isLocked = await isMonthLocked(db, member.bial_id, year, m);
      const entry = await db.prepare(`
        SELECT
          COALESCE(pathian_ram, 0) as pathian_ram,
          COALESCE(ramthar, 0) as ramthar,
          COALESCE(tualchhung, 0) as tualchhung,
          COALESCE(building, 0) as building,
          COALESCE(total, 0) as total
        FROM tithes
        WHERE member_id = ? AND year = ? AND month = ?
      `).bind(memberId, year, m).first();

      monthlyEntries.push({
        month: m,
        month_name: monthNames[m],
        is_locked: isLocked ? 1 : 0,
        pathian_ram: entry ? entry.pathian_ram : 0,
        ramthar: entry ? entry.ramthar : 0,
        tualchhung: entry ? entry.tualchhung : 0,
        building: entry ? entry.building : 0,
        total: entry ? entry.total : 0
      });
    }

    const annualSummary = await db.prepare(`
      SELECT
        COALESCE(SUM(pathian_ram), 0) as total_pathian_ram,
        COALESCE(SUM(ramthar), 0) as total_ramthar,
        COALESCE(SUM(tualchhung), 0) as total_tualchhung,
        COALESCE(SUM(building), 0) as total_building,
        COALESCE(SUM(total), 0) as grand_total
      FROM tithes
      WHERE member_id = ? AND year = ?
    `).bind(memberId, year).first();

    return c.json({
      member,
      year,
      monthlyEntries,
      annualSummary
    });
  } catch (err) {
    return c.json({ error: 'Failed to fetch member payment history' }, 500);
  }
});

// ----------------------------------------------------
// BACKUP & RESTORE ROUTES
// ----------------------------------------------------
app.post('/backup/now', authMiddleware, requireAdmin, async (c) => {
  const db = c.env.DB;
  try {
    const { results: users } = await db.prepare('SELECT id, username, password_hash, role, bial_name, status, created_at FROM users').all();
    const { results: bials } = await db.prepare('SELECT id, name, code, user_id, created_at FROM bials').all();
    const { results: members } = await db.prepare('SELECT id, bial_id, year, sl_no, name, created_at FROM members').all();
    const { results: month_locks } = await db.prepare('SELECT id, bial_id, year, month, is_locked, updated_at FROM month_locks').all();
    const { results: tithes } = await db.prepare('SELECT id, member_id, bial_id, year, month, pathian_ram, ramthar, tualchhung, building, total, updated_at FROM tithes').all();

    const snapshot = {
      app: 'PATHIAN_RAM_TITHE_COLLECTION',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      stats: {
        users_count: users.length,
        bials_count: bials.length,
        members_count: members.length,
        tithes_count: tithes.length
      },
      data: { users, bials, members, month_locks, tithes }
    };

    const fileName = `pathian_ram_backup_${new Date().toISOString().slice(0, 10)}.json`;
    return new Response(JSON.stringify(snapshot, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${fileName}"`
      }
    });
  } catch (err) {
    return c.json({ error: 'Failed to generate cloud database snapshot' }, 500);
  }
});

app.get('/backup/list', authMiddleware, requireAdmin, async (c) => {
  return c.json([]);
});

app.post('/backup/restore', authMiddleware, requireAdmin, async (c) => {
  const db = c.env.DB;
  try {
    const body = await c.req.parseBody();
    const file = body['backup_file'];
    if (!file) return c.json({ error: 'No backup file provided' }, 400);

    const text = typeof file === 'string' ? file : await file.text();
    const snapshot = JSON.parse(text);

    if (!snapshot || !snapshot.data) {
      return c.json({ error: 'Invalid backup JSON file structure' }, 400);
    }

    const { users, bials, members, month_locks, tithes } = snapshot.data;

    // Execute atomic clear and restore
    await db.batch([
      db.prepare('DELETE FROM tithes'),
      db.prepare('DELETE FROM month_locks'),
      db.prepare('DELETE FROM members'),
      db.prepare('DELETE FROM bials'),
      db.prepare('DELETE FROM users')
    ]);

    const userStmts = (users || []).map(u =>
      db.prepare('INSERT INTO users (id, username, password_hash, role, bial_name, status) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(u.id, u.username, u.password_hash, u.role, u.bial_name, u.status || 'active')
    );
    if (userStmts.length) await db.batch(userStmts);

    const bialStmts = (bials || []).map(b =>
      db.prepare('INSERT INTO bials (id, name, code, user_id) VALUES (?, ?, ?, ?)')
        .bind(b.id, b.name, b.code, b.user_id)
    );
    if (bialStmts.length) await db.batch(bialStmts);

    const memberStmts = (members || []).map(m =>
      db.prepare('INSERT INTO members (id, bial_id, year, sl_no, name) VALUES (?, ?, ?, ?, ?)')
        .bind(m.id, m.bial_id, m.year || 2026, m.sl_no, m.name)
    );
    for (let i = 0; i < memberStmts.length; i += 80) {
      await db.batch(memberStmts.slice(i, i + 80));
    }

    const lockStmts = (month_locks || []).map(l =>
      db.prepare('INSERT INTO month_locks (id, bial_id, year, month, is_locked) VALUES (?, ?, ?, ?, ?)')
        .bind(l.id, l.bial_id, l.year, l.month, l.is_locked)
    );
    for (let i = 0; i < lockStmts.length; i += 80) {
      await db.batch(lockStmts.slice(i, i + 80));
    }

    const titheStmts = (tithes || []).map(t =>
      db.prepare('INSERT INTO tithes (id, member_id, bial_id, year, month, pathian_ram, ramthar, tualchhung, building, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(t.id, t.member_id, t.bial_id, t.year, t.month, t.pathian_ram, t.ramthar, t.tualchhung, t.building, t.total)
    );
    for (let i = 0; i < titheStmts.length; i += 80) {
      await db.batch(titheStmts.slice(i, i + 80));
    }

    return c.json({
      message: 'Cloud database restored successfully from snapshot',
      restored: {
        users: users?.length || 0,
        bials: bials?.length || 0,
        members: members?.length || 0,
        tithes: tithes?.length || 0
      }
    });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to restore snapshot' }, 500);
  }
});

export const onRequest = handle(app);
