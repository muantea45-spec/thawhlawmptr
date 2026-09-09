import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'pathian_ram_tithe_super_secret_jwt_key_2026';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired session token' });
    }
    req.user = user;
    next();
  });
}

export function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'ADMIN') {
    next();
  } else {
    res.status(403).json({ error: 'Admin privileges required' });
  }
}

export function requireBialUser(req, res, next) {
  if (req.user && (req.user.role === 'BIAL' || req.user.role === 'ADMIN')) {
    next();
  } else {
    res.status(403).json({ error: 'Bial User authorization required' });
  }
}
