import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';
import { authenticateToken, JWT_SECRET } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (user.status === 'locked') {
      return res.status(403).json({ error: 'This account has been locked by Admin' });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    let bialDetails = null;
    if (user.role === 'BIAL') {
      bialDetails = db.prepare('SELECT * FROM bials WHERE user_id = ?').get(user.id);
    }

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      bial_name: user.bial_name,
      bial_id: bialDetails ? bialDetails.id : null
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      message: 'Login successful',
      token,
      user: payload
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error during login' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = db.prepare('SELECT id, username, role, bial_name, status FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let bialDetails = null;
    if (user.role === 'BIAL') {
      bialDetails = db.prepare('SELECT * FROM bials WHERE user_id = ?').get(user.id);
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        bial_name: user.bial_name,
        bial_id: bialDetails ? bialDetails.id : null
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching session profile' });
  }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticateToken, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters long' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (currentPassword) {
      const match = bcrypt.compareSync(currentPassword, user.password_hash);
      if (!match) return res.status(400).json({ error: 'Incorrect current password' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(newPassword, salt);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update password' });
  }
});

export default router;
