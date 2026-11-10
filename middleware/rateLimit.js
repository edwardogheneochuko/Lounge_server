import { rateLimit } from "express-rate-limit";

const limiter = (windowMinutes, limit, message) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message },
  });

// Limits can be tuned with env vars (the test suite raises them for tests that sign in a lot)
const AUTH_LIMIT = Number(process.env.AUTH_RATE_LIMIT) || 20;
const RESET_LIMIT = Number(process.env.RESET_RATE_LIMIT) || 10;

// Login / register: slows down password guessing and mass sign-ups (per IP, per 15 min)
export const authLimiter = limiter(15, AUTH_LIMIT, "Too many attempts. Please wait a few minutes and try again.");

// Forgot / reset password: prevents inbox spamming and token guessing (per IP, per hour)
export const resetLimiter = limiter(60, RESET_LIMIT, "Too many password reset requests. Please try again later.");

// Endpoints that check the current password while signed in (per IP, per 15 min)
export const accountLimiter = limiter(15, AUTH_LIMIT, "Too many attempts. Please wait a few minutes and try again.");
