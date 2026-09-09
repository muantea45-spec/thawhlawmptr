import express from 'express';
import { db } from '../db/database.js';
import { authenticateToken, requireBialUser } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken, requireBialUser);

// Helper function to resolve target Bial ID
function getTargetBialId(req) {
  if (req.user.role === 'ADMIN') {
    return parseInt(req.query.bial_id || req.body.bial_id);
  }
  return req.user.bial_id;
}

// Helper function to check if month is locked for a Bial
export function isMonthLocked(bial_id, year, month) {
  const lock = db.prepare(`
    SELECT is_locked FROM month_locks
    WHERE bial_id = ? AND year = ? AND month = ?
  `).get(bial_id, year, month);

  return lock ? lock.is_locked === 1 : false;
}

// Helper validation function for strictly numeric digits-only non-negative values
function cleanNumericInput(val) {
  if (val === null || val === undefined || val === '') return 0;
  // If string, reject any non-numeric characters (except single decimal point)
  const strVal = String(val).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(strVal)) {
    return null; // Invalid digit format
  }
  const parsed = parseFloat(strVal);
  return isNaN(parsed) || parsed < 0 ? null : parsed;
}

// GET /api/tithes?bial_id=X&year=2026&month=1 - Get monthly ledger for Bial
router.get('/', (req, res) => {
  const bialId = getTargetBialId(req);
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) || (new Date().getMonth() + 1);

  if (!bialId) {
    return res.status(400).json({ error: 'bial_id is required' });
  }

  try {
    const locked = isMonthLocked(bialId, year, month);

    // Fetch members with their tithe entry for the specified month
    const rows = db.prepare(`
      SELECT
        m.id as member_id,
        m.sl_no,
        m.name,
        COALESCE(t.id, 0) as tithe_id,
        COALESCE(t.pathian_ram, 0) as pathian_ram,
        COALESCE(t.ramthar, 0) as ramthar,
        COALESCE(t.tualchhung, 0) as tualchhung,
        COALESCE(t.building, 0) as building,
        COALESCE(t.total, 0) as total
      FROM members m
      LEFT JOIN tithes t ON m.id = t.member_id AND t.year = ? AND t.month = ?
      WHERE m.bial_id = ?
      ORDER BY m.sl_no ASC, m.id ASC
    `).all(year, month, bialId);

    // Calculate Summary Footer Totals
    let sumPathianRam = 0;
    let sumRamthar = 0;
    let sumTualchhung = 0;
    let sumBuilding = 0;
    let grandTotal = 0;

    rows.forEach(r => {
      sumPathianRam += r.pathian_ram;
      sumRamthar += r.ramthar;
      sumTualchhung += r.tualchhung;
      sumBuilding += r.building;
      grandTotal += r.total;
    });

    res.json({
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
    console.error('Error fetching tithes ledger:', err);
    res.status(500).json({ error: 'Failed to fetch tithe records' });
  }
});

// POST /api/tithes/upsert - Single member tithe update
router.post('/upsert', (req, res) => {
  const { member_id, year, month, pathian_ram, ramthar, tualchhung, building } = req.body;
  const bialId = getTargetBialId(req);

  if (!bialId || !member_id || !year || !month) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  // Check Month Lock
  if (isMonthLocked(bialId, year, month) && req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Month Locked by Admin. Data entry and edits are restricted.' });
  }

  // Strictly Validate Numeric Digits
  const pr = cleanNumericInput(pathian_ram);
  const ram = cleanNumericInput(ramthar);
  const tual = cleanNumericInput(tualchhung);
  const bldg = cleanNumericInput(building);

  if (pr === null || ram === null || tual === null || bldg === null) {
    return res.status(400).json({
      error: 'Invalid numeric value. Financial entries accept DIGITS ONLY (non-negative numbers).'
    });
  }

  // AUTO-CALCULATED TOTAL
  const rowTotal = pr + ram + tual + bldg;

  try {
    db.prepare(`
      INSERT INTO tithes (member_id, bial_id, year, month, pathian_ram, ramthar, tualchhung, building, total, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(member_id, year, month) DO UPDATE SET
        pathian_ram = excluded.pathian_ram,
        ramthar = excluded.ramthar,
        tualchhung = excluded.tualchhung,
        building = excluded.building,
        total = excluded.total,
        updated_at = CURRENT_TIMESTAMP
    `).run(member_id, bialId, year, month, pr, ram, tual, bldg, rowTotal);

    res.json({
      message: 'Tithe entry saved successfully',
      entry: {
        member_id,
        year,
        month,
        pathian_ram: pr,
        ramthar: ram,
        tualchhung: tual,
        building: bldg,
        total: rowTotal
      }
    });
  } catch (err) {
    console.error('Error saving tithe entry:', err);
    res.status(500).json({ error: 'Failed to save tithe entry' });
  }
});

// POST /api/tithes/bulk-upsert - Save whole monthly matrix in single batch
router.post('/bulk-upsert', (req, res) => {
  const { entries, year, month } = req.body;
  const bialId = getTargetBialId(req);

  if (!bialId || !year || !month || !Array.isArray(entries)) {
    return res.status(400).json({ error: 'Invalid payload for bulk save' });
  }

  // Check Month Lock
  if (isMonthLocked(bialId, year, month) && req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Month Locked by Admin. Edits are not allowed.' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO tithes (member_id, bial_id, year, month, pathian_ram, ramthar, tualchhung, building, total, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(member_id, year, month) DO UPDATE SET
        pathian_ram = excluded.pathian_ram,
        ramthar = excluded.ramthar,
        tualchhung = excluded.tualchhung,
        building = excluded.building,
        total = excluded.total,
        updated_at = CURRENT_TIMESTAMP
    `);

    for (const item of entries) {
      const pr = cleanNumericInput(item.pathian_ram) || 0;
      const ram = cleanNumericInput(item.ramthar) || 0;
      const tual = cleanNumericInput(item.tualchhung) || 0;
      const bldg = cleanNumericInput(item.building) || 0;
      const rowTotal = pr + ram + tual + bldg;

      stmt.run(item.member_id, bialId, year, month, pr, ram, tual, bldg, rowTotal);
    }

    res.json({ message: 'Bulk tithes saved successfully' });
  } catch (err) {
    console.error('Bulk save error:', err);
    res.status(500).json({ error: 'Failed to complete bulk save' });
  }
});

// GET /api/tithes/yearly-summary?bial_id=X&year=2026 - Aggregated yearly collection for Bial
router.get('/yearly-summary', (req, res) => {
  const bialId = getTargetBialId(req);
  const year = parseInt(req.query.year) || new Date().getFullYear();

  if (!bialId) {
    return res.status(400).json({ error: 'bial_id is required' });
  }

  try {
    const bial = db.prepare('SELECT id, name, code FROM bials WHERE id = ?').get(bialId);
    if (!bial) {
      return res.status(404).json({ error: 'Bial not found' });
    }

    const financialMonthOrder = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
    const monthNames = {
      1: 'January', 2: 'February', 3: 'March', 4: 'April', 5: 'May', 6: 'June',
      7: 'July', 8: 'August', 9: 'September', 10: 'October', 11: 'November', 12: 'December'
    };

    const monthlyBreakdown = financialMonthOrder.map(m => {
      const row = db.prepare(`
        SELECT
          COALESCE(SUM(pathian_ram), 0) as pathian_ram,
          COALESCE(SUM(ramthar), 0) as ramthar,
          COALESCE(SUM(tualchhung), 0) as tualchhung,
          COALESCE(SUM(building), 0) as building,
          COALESCE(SUM(total), 0) as total
        FROM tithes
        WHERE bial_id = ? AND year = ? AND month = ?
      `).get(bialId, year, m);

      return {
        month: m,
        month_name: monthNames[m],
        ...row
      };
    });

    const memberTotals = db.prepare(`
      SELECT
        m.id as member_id,
        m.sl_no,
        m.name,
        COALESCE(SUM(t.pathian_ram), 0) as total_pathian_ram,
        COALESCE(SUM(t.ramthar), 0) as total_ramthar,
        COALESCE(SUM(t.tualchhung), 0) as total_tualchhung,
        COALESCE(SUM(t.building), 0) as total_building,
        COALESCE(SUM(t.total), 0) as grand_total
      FROM members m
      LEFT JOIN tithes t ON m.id = t.member_id AND t.year = ?
      WHERE m.bial_id = ?
      GROUP BY m.id
      ORDER BY m.sl_no ASC, m.id ASC
    `).all(year, bialId);

    const grandTotals = db.prepare(`
      SELECT
        COALESCE(SUM(pathian_ram), 0) as total_pathian_ram,
        COALESCE(SUM(ramthar), 0) as total_ramthar,
        COALESCE(SUM(tualchhung), 0) as total_tualchhung,
        COALESCE(SUM(building), 0) as total_building,
        COALESCE(SUM(total), 0) as grand_total
      FROM tithes
      WHERE bial_id = ? AND year = ?
    `).get(bialId, year);

    res.json({
      bial,
      year,
      monthlyBreakdown,
      memberTotals,
      grandTotals
    });
  } catch (err) {
    console.error('Error fetching bial yearly summary:', err);
    res.status(500).json({ error: 'Failed to fetch yearly summary' });
  }
});

// GET /api/tithes/member-history?member_id=X&year=2026 - Individual member payment statement
router.get('/member-history', (req, res) => {
  const memberId = parseInt(req.query.member_id);
  const year = parseInt(req.query.year) || new Date().getFullYear();

  if (!memberId) {
    return res.status(400).json({ error: 'member_id is required' });
  }

  try {
    const member = db.prepare(`
      SELECT m.id, m.sl_no, m.name, m.bial_id, b.name as bial_name, b.code as bial_code
      FROM members m
      JOIN bials b ON m.bial_id = b.id
      WHERE m.id = ?
    `).get(memberId);

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (req.user.role !== 'ADMIN' && req.user.bial_id !== member.bial_id) {
      return res.status(403).json({ error: 'Access denied to member outside your Bial' });
    }

    const financialMonthOrder = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
    const monthNames = {
      1: 'January', 2: 'February', 3: 'March', 4: 'April', 5: 'May', 6: 'June',
      7: 'July', 8: 'August', 9: 'September', 10: 'October', 11: 'November', 12: 'December'
    };

    const monthlyEntries = financialMonthOrder.map(m => {
      const entry = db.prepare(`
        SELECT
          COALESCE(pathian_ram, 0) as pathian_ram,
          COALESCE(ramthar, 0) as ramthar,
          COALESCE(tualchhung, 0) as tualchhung,
          COALESCE(building, 0) as building,
          COALESCE(total, 0) as total
        FROM tithes
        WHERE member_id = ? AND year = ? AND month = ?
      `).get(memberId, year, m);

      return {
        month: m,
        month_name: monthNames[m],
        pathian_ram: entry ? entry.pathian_ram : 0,
        ramthar: entry ? entry.ramthar : 0,
        tualchhung: entry ? entry.tualchhung : 0,
        building: entry ? entry.building : 0,
        total: entry ? entry.total : 0
      };
    });

    const annualSummary = db.prepare(`
      SELECT
        COALESCE(SUM(pathian_ram), 0) as total_pathian_ram,
        COALESCE(SUM(ramthar), 0) as total_ramthar,
        COALESCE(SUM(tualchhung), 0) as total_tualchhung,
        COALESCE(SUM(building), 0) as total_building,
        COALESCE(SUM(total), 0) as grand_total
      FROM tithes
      WHERE member_id = ? AND year = ?
    `).get(memberId, year);

    res.json({
      member,
      year,
      monthlyEntries,
      annualSummary
    });
  } catch (err) {
    console.error('Error fetching member history:', err);
    res.status(500).json({ error: 'Failed to fetch member payment history' });
  }
});

export default router;

