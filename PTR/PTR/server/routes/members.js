import express from 'express';
import { db } from '../db/database.js';
import { authenticateToken, requireBialUser } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken, requireBialUser);

// Helper function to resolve target Bial ID (Admin can specify bial_id or use req.user.bial_id)
function getTargetBialId(req) {
  if (req.user.role === 'ADMIN') {
    return parseInt(req.query.bial_id || req.body.bial_id);
  }
  return req.user.bial_id;
}

// GET /api/members?bial_id=X - List members for a Bial
router.get('/', (req, res) => {
  const bialId = getTargetBialId(req);
  if (!bialId) {
    return res.status(400).json({ error: 'bial_id is required' });
  }

  try {
    const members = db.prepare(`
      SELECT id, bial_id, sl_no, name, created_at
      FROM members
      WHERE bial_id = ?
      ORDER BY sl_no ASC, id ASC
    `).all(bialId);

    res.json(members);
  } catch (err) {
    console.error('Error fetching members:', err);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// POST /api/members - Add a new member under a Bial
router.post('/', (req, res) => {
  const { name, sl_no } = req.body;
  const bialId = getTargetBialId(req);

  if (!bialId) {
    return res.status(400).json({ error: 'bial_id is required' });
  }

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'Member name (HMING) is required' });
  }

  try {
    let nextSlNo = parseInt(sl_no);
    if (!nextSlNo || isNaN(nextSlNo)) {
      const maxSl = db.prepare('SELECT MAX(sl_no) as max_sl FROM members WHERE bial_id = ?').get(bialId);
      nextSlNo = (maxSl && maxSl.max_sl) ? maxSl.max_sl + 1 : 1;
    }

    const result = db.prepare(`
      INSERT INTO members (bial_id, sl_no, name)
      VALUES (?, ?, ?)
    `).run(bialId, nextSlNo, name.trim());

    res.status(201).json({
      message: 'Member added successfully',
      member: {
        id: result.lastInsertRowid,
        bial_id: bialId,
        sl_no: nextSlNo,
        name: name.trim()
      }
    });
  } catch (err) {
    console.error('Error adding member:', err);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// PUT /api/members/:id - Update member details
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, sl_no } = req.body;
  const bialId = getTargetBialId(req);

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
