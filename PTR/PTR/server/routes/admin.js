import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/database.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware to all admin routes
router.use(authenticateToken, requireAdmin);

// GET /api/admin/bials - List all Bials with statistics
router.get('/bials', (req, res) => {
  try {
    const bials = db.prepare(`
      SELECT b.id, b.name, b.code, b.user_id, u.username, u.status, u.created_at,
      (SELECT COUNT(*) FROM members m WHERE m.bial_id = b.id) as member_count,
      (SELECT COALESCE(SUM(t.total), 0) FROM tithes t WHERE t.bial_id = b.id) as total_collected
      FROM bials b
      JOIN users u ON b.user_id = u.id
      ORDER BY b.name ASC
    `).all();

    res.json(bials);
  } catch (err) {
    console.error('Error fetching bials:', err);
    res.status(500).json({ error: 'Failed to fetch Bials' });
  }
});

// POST /api/admin/bials - Create new Bial account
router.post('/bials', (req, res) => {
  const { name, code, username, password } = req.body;

  if (!name || !code || !username || !password) {
    return res.status(400).json({ error: 'All fields (name, code, username, password) are required' });
  }

  try {
    // Check if username or bial name exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const existingBial = db.prepare('SELECT id FROM bials WHERE name = ?').get(name.trim());
    if (existingBial) {
      return res.status(400).json({ error: 'Bial name already exists' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    // Create User
    const userRes = db.prepare(`
      INSERT INTO users (username, password_hash, role, bial_name, status)
      VALUES (?, ?, 'BIAL', ?, 'active')
    `).run(username.trim(), hash, name.trim());

    // Create Bial
    const bialRes = db.prepare(`
      INSERT INTO bials (name, code, user_id)
      VALUES (?, ?, ?)
    `).run(name.trim(), code.trim(), userRes.lastInsertRowid);

    res.status(201).json({
      message: 'Bial account created successfully',
      bial: {
        id: bialRes.lastInsertRowid,
        name: name.trim(),
        code: code.trim(),
        username: username.trim()
      }
    });
  } catch (err) {
    console.error('Error creating bial:', err);
    res.status(500).json({ error: 'Failed to create Bial account' });
  }
});

// PUT /api/admin/bials/:id - Update Bial account details or lock/unlock account
router.put('/bials/:id', (req, res) => {
  const { id } = req.params;
  const { name, code, username, password, status } = req.body;

  try {
    const bial = db.prepare('SELECT * FROM bials WHERE id = ?').get(id);
    if (!bial) {
      return res.status(404).json({ error: 'Bial not found' });
    }

    if (name) {
      db.prepare('UPDATE bials SET name = ? WHERE id = ?').run(name.trim(), id);
      db.prepare('UPDATE users SET bial_name = ? WHERE id = ?').run(name.trim(), bial.user_id);
    }
    if (code) {
      db.prepare('UPDATE bials SET code = ? WHERE id = ?').run(code.trim(), id);
    }
    if (username) {
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username.trim(), bial.user_id);
    }
    if (status && (status === 'active' || status === 'locked')) {
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, bial.user_id);
    }
    if (password && password.length > 0) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(password, salt);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, bial.user_id);
    }

    res.json({ message: 'Bial account updated successfully' });
  } catch (err) {
    console.error('Error updating bial:', err);
    res.status(500).json({ error: 'Failed to update Bial' });
  }
});

// DELETE /api/admin/bials/:id - Delete Bial account and all associated data
router.delete('/bials/:id', (req, res) => {
  const { id } = req.params;

  try {
    const bial = db.prepare('SELECT * FROM bials WHERE id = ?').get(id);
    if (!bial) {
      return res.status(404).json({ error: 'Bial not found' });
    }

    // Cascading deletes handled by foreign keys or manual cleanup
    db.prepare('DELETE FROM tithes WHERE bial_id = ?').run(id);
    db.prepare('DELETE FROM members WHERE bial_id = ?').run(id);
    db.prepare('DELETE FROM month_locks WHERE bial_id = ?').run(id);
    db.prepare('DELETE FROM bials WHERE id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(bial.user_id);

    res.json({ message: 'Bial deleted successfully' });
  } catch (err) {
    console.error('Error deleting bial:', err);
    res.status(500).json({ error: 'Failed to delete Bial' });
  }
});

// GET /api/admin/month-locks?year=2026 - Fetch month locks matrix
router.get('/month-locks', (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();

  try {
    const bials = db.prepare('SELECT id, name, code FROM bials ORDER BY name ASC').all();
    const locks = db.prepare('SELECT * FROM month_locks WHERE year = ?').all(year);

    // Build lock matrix mapping: { [bial_id]: { [month]: is_locked } }
    const matrix = {};

    // Initialize with 0 (unlocked) for all bials and months 1-12
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

    res.json({
      year,
      bials,
      matrix
    });
  } catch (err) {
    console.error('Error fetching month locks:', err);
    res.status(500).json({ error: 'Failed to fetch month locks matrix' });
  }
});

// POST /api/admin/month-locks/toggle - Toggle single Bial month lock or Global month lock
router.post('/month-locks/toggle', (req, res) => {
  const { bial_id, year, month, is_locked, global_toggle } = req.body;
  const targetYear = parseInt(year) || new Date().getFullYear();
  const targetMonth = parseInt(month);

  if (!targetMonth || targetMonth < 1 || targetMonth > 12) {
    return res.status(400).json({ error: 'Invalid month (1-12 required)' });
  }

  try {
    if (global_toggle) {
      // Toggle for ALL bials for this month and year
      const bials = db.prepare('SELECT id FROM bials').all();
      const lockVal = is_locked ? 1 : 0;

      for (const b of bials) {
        db.prepare(`
          INSERT INTO month_locks (bial_id, year, month, is_locked, updated_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(bial_id, year, month) DO UPDATE SET
            is_locked = excluded.is_locked,
            updated_at = CURRENT_TIMESTAMP
        `).run(b.id, targetYear, targetMonth, lockVal);
      }

      return res.json({
        message: `Global lock for month ${targetMonth} set to ${lockVal ? 'LOCKED' : 'UNLOCKED'}`
      });
    } else {
      // Single Bial toggle
      if (!bial_id) {
        return res.status(400).json({ error: 'bial_id is required' });
      }

      const lockVal = is_locked ? 1 : 0;
      db.prepare(`
        INSERT INTO month_locks (bial_id, year, month, is_locked, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(bial_id, year, month) DO UPDATE SET
          is_locked = excluded.is_locked,
          updated_at = CURRENT_TIMESTAMP
      `).run(bial_id, targetYear, targetMonth, lockVal);

      return res.json({
        message: `Bial lock updated for month ${targetMonth}`
      });
    }
  } catch (err) {
    console.error('Error toggling month lock:', err);
    res.status(500).json({ error: 'Failed to update month lock' });
  }
});

// GET /api/admin/dashboard - Aggregated Global Analytics
router.get('/dashboard', (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();

  try {
    // Aggregated totals
    const grandTotals = db.prepare(`
      SELECT
        COALESCE(SUM(pathian_ram), 0) as total_pathian_ram,
        COALESCE(SUM(ramthar), 0) as total_ramthar,
        COALESCE(SUM(tualchhung), 0) as total_tualchhung,
        COALESCE(SUM(building), 0) as total_building,
        COALESCE(SUM(total), 0) as grand_total
      FROM tithes
      WHERE year = ?
    `).get(year);

    // Totals per Bial
    const bialBreakdown = db.prepare(`
      SELECT
        b.id,
        b.name,
        b.code,
        COALESCE(SUM(t.pathian_ram), 0) as pathian_ram,
        COALESCE(SUM(t.ramthar), 0) as ramthar,
        COALESCE(SUM(t.tualchhung), 0) as tualchhung,
        COALESCE(SUM(t.building), 0) as building,
        COALESCE(SUM(t.total), 0) as total
      FROM bials b
      LEFT JOIN tithes t ON b.id = t.bial_id AND t.year = ?
      GROUP BY b.id
      ORDER BY total DESC
    `).all(year);

    // Monthly breakdown (Jan - Dec)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyTrends = [];

    for (let m = 1; m <= 12; m++) {
      const mData = db.prepare(`
        SELECT
          COALESCE(SUM(pathian_ram), 0) as pathian_ram,
          COALESCE(SUM(ramthar), 0) as ramthar,
          COALESCE(SUM(tualchhung), 0) as tualchhung,
          COALESCE(SUM(building), 0) as building,
          COALESCE(SUM(total), 0) as total
        FROM tithes
        WHERE year = ? AND month = ?
      `).get(year, m);

      monthlyTrends.push({
        month: monthNames[m - 1],
        monthNum: m,
        ...mData
      });
    }

    res.json({
      year,
      grandTotals,
      bialBreakdown,
      monthlyTrends
    });
  } catch (err) {
    console.error('Error fetching admin dashboard stats:', err);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

// GET /api/admin/years - List all configured Financial Years
router.get('/years', (req, res) => {
  try {
    const rows = db.prepare('SELECT year FROM financial_years ORDER BY year ASC').all();
    const years = rows.map(r => r.year);
    res.json(years.length > 0 ? years : [2024, 2025, 2026, 2027]);
  } catch (err) {
    console.error('Error fetching financial years:', err);
    res.status(500).json({ error: 'Failed to fetch financial years' });
  }
});

// POST /api/admin/years - Add a new Financial Year
router.post('/years', (req, res) => {
  const { year } = req.body;
  const numYear = parseInt(year);

  if (isNaN(numYear) || numYear < 2000 || numYear > 2100) {
    return res.status(400).json({ error: 'Valid 4-digit financial year required (e.g., 2026)' });
  }

  try {
    const existing = db.prepare('SELECT id FROM financial_years WHERE year = ?').get(numYear);
    if (existing) {
      return res.status(400).json({ error: `Financial Year ${numYear} already exists` });
    }

    db.prepare('INSERT INTO financial_years (year) VALUES (?)').run(numYear);
    res.status(201).json({ message: `Financial Year ${numYear} added successfully`, year: numYear });
  } catch (err) {
    console.error('Error adding financial year:', err);
    res.status(500).json({ error: 'Failed to add financial year' });
  }
});

// DELETE /api/admin/years/:year - Delete a Financial Year
router.delete('/years/:year', (req, res) => {
  const numYear = parseInt(req.params.year);
  if (isNaN(numYear)) {
    return res.status(400).json({ error: 'Invalid financial year' });
  }

  try {
    const countRes = db.prepare('SELECT COUNT(*) as count FROM financial_years').get();
    if (countRes.count <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last remaining Financial Year' });
    }

    db.prepare('DELETE FROM financial_years WHERE year = ?').run(numYear);
    res.json({ message: `Financial Year ${numYear} deleted successfully` });
  } catch (err) {
    console.error('Error deleting financial year:', err);
    res.status(500).json({ error: 'Failed to delete financial year' });
  }
});

export default router;
