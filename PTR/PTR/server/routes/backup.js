import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { db } from '../db/database.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
router.use(authenticateToken, requireAdmin);

const backupsDir = path.join(__dirname, '../../backups');
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

// Multer upload config for restore files
const upload = multer({
  dest: path.join(__dirname, '../../data/tmp_uploads'),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// Helper to generate full DB snapshot payload object
export function generateBackupSnapshot() {
  const users = db.prepare('SELECT id, username, password_hash, role, bial_name, status, created_at FROM users').all();
  const bials = db.prepare('SELECT id, name, code, user_id, created_at FROM bials').all();
  const members = db.prepare('SELECT id, bial_id, sl_no, name, created_at FROM members').all();
  const month_locks = db.prepare('SELECT id, bial_id, year, month, is_locked, updated_at FROM month_locks').all();
  const tithes = db.prepare('SELECT id, member_id, bial_id, year, month, pathian_ram, ramthar, tualchhung, building, total, updated_at FROM tithes').all();

  return {
    app: 'PATHIAN_RAM_TITHE_COLLECTION',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    stats: {
      users_count: users.length,
      bials_count: bials.length,
      members_count: members.length,
      tithes_count: tithes.length
    },
    data: {
      users,
      bials,
      members,
      month_locks,
      tithes
    }
  };
}

// POST /api/backup/now - Instant Manual Backup Trigger & Download
router.post('/now', (req, res) => {
  try {
    const snapshot = generateBackupSnapshot();
    const fileName = `pathian_ram_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filePath = path.join(backupsDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.status(200).send(JSON.stringify(snapshot, null, 2));
  } catch (err) {
    console.error('Backup creation error:', err);
    res.status(500).json({ error: 'Failed to create database backup snapshot' });
  }
});

// GET /api/backup/list - List saved backup history files
router.get('/list', (req, res) => {
  try {
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const stats = fs.statSync(path.join(backupsDir, f));
        return {
          filename: f,
          size: stats.size,
          created_at: stats.mtime
        };
      })
      .sort((a, b) => b.created_at - a.created_at);

    res.json(files);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// GET /api/backup/download/:filename - Download specific backup file
router.get('/download/:filename', (req, res) => {
  const fileName = req.params.filename;
  const filePath = path.join(backupsDir, fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup file not found' });
  }

  res.download(filePath);
});

// POST /api/backup/restore - Restore Database from Uploaded JSON Snapshot
router.post('/restore', upload.single('backup_file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No backup file uploaded' });
  }

  const uploadedPath = req.file.path;

  try {
    const fileContent = fs.readFileSync(uploadedPath, 'utf-8');
    const snapshot = JSON.parse(fileContent);

    if (!snapshot.app || snapshot.app !== 'PATHIAN_RAM_TITHE_COLLECTION' || !snapshot.data) {
      fs.unlinkSync(uploadedPath);
      return res.status(400).json({ error: 'Invalid backup file format or incompatible application schema' });
    }

    const { users, bials, members, month_locks, tithes } = snapshot.data;

    // Begin database restoration inside SQLite transaction
    db.exec('PRAGMA foreign_keys = OFF;');

    db.exec('DELETE FROM tithes;');
    db.exec('DELETE FROM month_locks;');
    db.exec('DELETE FROM members;');
    db.exec('DELETE FROM bials;');
    db.exec('DELETE FROM users;');

    // Insert Users
    if (Array.isArray(users)) {
      const uStmt = db.prepare('INSERT INTO users (id, username, password_hash, role, bial_name, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      users.forEach(u => uStmt.run(u.id, u.username, u.password_hash, u.role, u.bial_name, u.status || 'active', u.created_at));
    }

    // Insert Bials
    if (Array.isArray(bials)) {
      const bStmt = db.prepare('INSERT INTO bials (id, name, code, user_id, created_at) VALUES (?, ?, ?, ?, ?)');
      bials.forEach(b => bStmt.run(b.id, b.name, b.code, b.user_id, b.created_at));
    }

    // Insert Members
    if (Array.isArray(members)) {
      const mStmt = db.prepare('INSERT INTO members (id, bial_id, sl_no, name, created_at) VALUES (?, ?, ?, ?, ?)');
      members.forEach(m => mStmt.run(m.id, m.bial_id, m.sl_no, m.name, m.created_at));
    }

    // Insert Month Locks
    if (Array.isArray(month_locks)) {
      const lStmt = db.prepare('INSERT INTO month_locks (id, bial_id, year, month, is_locked, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
      month_locks.forEach(l => lStmt.run(l.id, l.bial_id, l.year, l.month, l.is_locked, l.updated_at));
    }

    // Insert Tithes
    if (Array.isArray(tithes)) {
      const tStmt = db.prepare('INSERT INTO tithes (id, member_id, bial_id, year, month, pathian_ram, ramthar, tualchhung, building, total, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      tithes.forEach(t => tStmt.run(t.id, t.member_id, t.bial_id, t.year, t.month, t.pathian_ram, t.ramthar, t.tualchhung, t.building, t.total, t.updated_at));
    }

    db.exec('PRAGMA foreign_keys = ON;');

    // Clean temp file
    if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);

    res.json({
      message: 'Database snapshot successfully restored!',
      restored_stats: snapshot.stats
    });
  } catch (err) {
    if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    console.error('Restore error:', err);
    res.status(500).json({ error: 'Failed to restore database from backup file' });
  }
});

export default router;
