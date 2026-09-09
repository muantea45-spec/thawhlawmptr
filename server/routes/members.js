import express from 'express';
import { db } from '../db/database.js';
import { authenticateToken, requireBialUser, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken, requireBialUser);

// Helper function to resolve target Bial ID (Admin can specify bial_id or use req.user.bial_id)
function getTargetBialId(req) {
  if (req.user.role === 'ADMIN') {
    const qVal = req.query.bial_id || req.body.bial_id;
    if (qVal === 'all') return 'all';
    return parseInt(qVal);
  }
  return req.user.bial_id;
}

// Helper to get active financial year
function getActiveYear() {
  try {
    const row = db.prepare('SELECT year FROM financial_years WHERE is_active = 1 LIMIT 1').get();
    return row ? row.year : new Date().getFullYear();
  } catch (e) {
    return new Date().getFullYear();
  }
}

// GET /api/members?bial_id=X&year=2026 - List members for a Bial and specific FY
router.get('/', (req, res) => {
  const bialId = getTargetBialId(req);
  const year = parseInt(req.query.year) || getActiveYear();

  if (!bialId) {
    return res.status(400).json({ error: 'bial_id is required' });
  }

  try {
    let members;
    if (bialId === 'all') {
      members = db.prepare(`
        SELECT m.id, m.bial_id, m.year, m.sl_no, m.name, m.created_at, b.name as bial_name, b.code as bial_code
        FROM members m
        JOIN bials b ON m.bial_id = b.id
        WHERE m.year = ?
        ORDER BY b.name ASC, m.sl_no ASC, m.id ASC
      `).all(year);
    } else {
      members = db.prepare(`
        SELECT id, bial_id, year, sl_no, name, created_at
        FROM members
        WHERE bial_id = ? AND year = ?
        ORDER BY sl_no ASC, id ASC
      `).all(bialId, year);
    }

    res.json(members);
  } catch (err) {
    console.error('Error fetching members:', err);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// POST /api/members - Add a new member under a Bial for a specific FY
router.post('/', (req, res) => {
  const { name, sl_no, year: reqYear } = req.body;
  const bialId = getTargetBialId(req);
  const year = parseInt(reqYear) || getActiveYear();

  if (!bialId || bialId === 'all') {
    return res.status(400).json({ error: 'Specific bial_id is required' });
  }

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'Member name (HMING) is required' });
  }

  try {
    let nextSlNo = parseInt(sl_no);
    if (!nextSlNo || isNaN(nextSlNo)) {
      const maxSl = db.prepare('SELECT MAX(sl_no) as max_sl FROM members WHERE bial_id = ? AND year = ?').get(bialId, year);
      nextSlNo = (maxSl && maxSl.max_sl) ? maxSl.max_sl + 1 : 1;
    }

    const result = db.prepare(`
      INSERT INTO members (bial_id, year, sl_no, name)
      VALUES (?, ?, ?, ?)
    `).run(bialId, year, nextSlNo, name.trim());

    res.status(201).json({
      message: 'Member added successfully',
      member: {
        id: result.lastInsertRowid,
        bial_id: bialId,
        year,
        sl_no: nextSlNo,
        name: name.trim()
      }
    });
  } catch (err) {
    console.error('Error adding member:', err);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// POST /api/members/rollover - Rollover all member names (only) from one FY to the next (ADMIN ONLY)
router.post('/rollover', requireAdmin, (req, res) => {
  const { source_year, target_year, bial_id: reqBialId } = req.body;
  const sourceYear = parseInt(source_year);
  const targetYear = parseInt(target_year);

  if (!sourceYear || !targetYear || isNaN(sourceYear) || isNaN(targetYear)) {
    return res.status(400).json({ error: 'Valid source_year and target_year are required' });
  }

  if (sourceYear === targetYear) {
    return res.status(400).json({ error: 'Source and target financial years must be different' });
  }

  let targetBialId;
  if (req.user.role === 'ADMIN') {
    targetBialId = reqBialId === 'all' || !reqBialId ? 'all' : parseInt(reqBialId);
  } else {
    targetBialId = req.user.bial_id;
  }

  try {
    let sourceMembers;
    if (targetBialId === 'all') {
      sourceMembers = db.prepare(`
        SELECT bial_id, sl_no, name
        FROM members
        WHERE year = ?
        ORDER BY bial_id ASC, sl_no ASC, id ASC
      `).all(sourceYear);
    } else {
      sourceMembers = db.prepare(`
        SELECT bial_id, sl_no, name
        FROM members
        WHERE bial_id = ? AND year = ?
        ORDER BY sl_no ASC, id ASC
      `).all(targetBialId, sourceYear);
    }

    if (sourceMembers.length === 0) {
      return res.status(400).json({
        error: `No members found in FY ${sourceYear} to rollover.`
      });
    }

    // Rollover transaction: copy only names and sl_no into target_year (avoiding duplicate names)
    db.exec('BEGIN TRANSACTION;');
    let rolledOverCount = 0;
    let skippedCount = 0;

    const checkStmt = db.prepare('SELECT id FROM members WHERE bial_id = ? AND year = ? AND LOWER(name) = LOWER(?) LIMIT 1');
    const insertStmt = db.prepare('INSERT INTO members (bial_id, year, sl_no, name) VALUES (?, ?, ?, ?)');

    for (const m of sourceMembers) {
      const existing = checkStmt.get(m.bial_id, targetYear, m.name.trim());
      if (!existing) {
        insertStmt.run(m.bial_id, targetYear, m.sl_no, m.name.trim());
        rolledOverCount++;
      } else {
        skippedCount++;
      }
    }

    db.exec('COMMIT;');

    res.json({
      success: true,
      message: `Successfully rolled over ${rolledOverCount} member name(s) from FY ${sourceYear} to FY ${targetYear}.${skippedCount > 0 ? ` (${skippedCount} already existed).` : ''}`,
      rolled_over_count: rolledOverCount,
      skipped_count: skippedCount,
      total_source_members: sourceMembers.length,
      source_year: sourceYear,
      target_year: targetYear
    });
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (e) {}
    console.error('Error rolling over members:', err);
    res.status(500).json({ error: err.message || 'Failed to rollover members' });
  }
});

// PUT /api/members/:id - Update member details
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, sl_no } = req.body;

  try {
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (req.user.role === 'BIAL' && member.bial_id !== req.user.bial_id) {
      return res.status(403).json({ error: 'Unauthorized to modify member of another Bial' });
    }

    if (name && name.trim().length > 0) {
      db.prepare('UPDATE members SET name = ? WHERE id = ?').run(name.trim(), id);
    }

    if (sl_no !== undefined && !isNaN(parseInt(sl_no))) {
      db.prepare('UPDATE members SET sl_no = ? WHERE id = ?').run(parseInt(sl_no), id);
    }

    res.json({ message: 'Member updated successfully' });
  } catch (err) {
    console.error('Error updating member:', err);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// DELETE /api/members/:id - Delete a member and associated tithe records
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  try {
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (req.user.role === 'BIAL' && member.bial_id !== req.user.bial_id) {
      return res.status(403).json({ error: 'Unauthorized to delete member of another Bial' });
    }

    db.prepare('DELETE FROM tithes WHERE member_id = ?').run(id);
    db.prepare('DELETE FROM members WHERE id = ?').run(id);

    res.json({ message: 'Member deleted successfully' });
  } catch (err) {
    console.error('Error deleting member:', err);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

export default router;
