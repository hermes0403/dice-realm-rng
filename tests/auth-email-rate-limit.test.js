import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthEmailRateLimitMessage } from '../services/auth.js';

test('signup project email limit clearly states that the verification email was not sent', () => {
  const message = getAuthEmailRateLimitMessage('signup', {
    status: 429,
    code: 'over_email_send_rate_limit',
    message: '429: email rate limit exceeded'
  });
  assert.match(message, /沒有寄出註冊驗證信/);
  assert.match(message, /全專案共用/);
  assert.match(message, /自訂郵件服務/);
});

test('signup per-user cooldown displays the server supplied wait duration', () => {
  const message = getAuthEmailRateLimitMessage('signup', {
    status: 429,
    message: '429: For security purposes, you can only request this after 19 seconds.'
  });
  assert.match(message, /等待 19 秒/);
  assert.match(message, /不要連續按按鈕/);
});

test('password reset uses the correct email type in the rate limit message', () => {
  const message = getAuthEmailRateLimitMessage('reset', {
    status: 429,
    message: 'email rate limit exceeded'
  });
  assert.match(message, /沒有寄出密碼重設信/);
});
