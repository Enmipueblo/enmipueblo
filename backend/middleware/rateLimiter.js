// backend/middleware/rateLimiter.js

import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';

// Límite de peticiones (100 por IP cada 15 minutos)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Ralentizar después de X peticiones (más leve)
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutos
  delayMs: () => 500, // 500ms extra por petición adicional
});

export { limiter, speedLimiter };

