import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  subscribeToToken,
  tokenService
} from '../tokenService.js';

describe('tokenService', () => {
  beforeEach(() => {
    clearAccessToken();
  });

  it('starts with null in-memory access token', () => {
    expect(getAccessToken()).toBeNull();
  });

  it('sets and gets in-memory access token', () => {
    const token = 'sample.jwt.access-token';
    setAccessToken(token);
    expect(getAccessToken()).toBe(token);
  });

  it('clears in-memory access token', () => {
    setAccessToken('sample.token');
    expect(getAccessToken()).toBe('sample.token');
    clearAccessToken();
    expect(getAccessToken()).toBeNull();
  });

  it('notifies subscribers when token changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToToken(listener);

    setAccessToken('jwt-1');
    expect(listener).toHaveBeenCalledWith('jwt-1');

    setAccessToken('jwt-2');
    expect(listener).toHaveBeenCalledWith('jwt-2');

    clearAccessToken();
    expect(listener).toHaveBeenCalledWith(null);

    unsubscribe();
    setAccessToken('jwt-3');
    expect(listener).toHaveBeenCalledTimes(3); // Not called after unsubscribe
  });

  it('never stores tokens in localStorage or sessionStorage', () => {
    setAccessToken('super-secret-jwt-token');

    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('jwt')).toBeNull();
    }
    if (typeof sessionStorage !== 'undefined') {
      expect(sessionStorage.getItem('accessToken')).toBeNull();
      expect(sessionStorage.getItem('token')).toBeNull();
      expect(sessionStorage.getItem('jwt')).toBeNull();
    }
  });

  it('exports helper object tokenService matching individual functions', () => {
    expect(tokenService.getAccessToken).toBe(getAccessToken);
    expect(tokenService.setAccessToken).toBe(setAccessToken);
    expect(tokenService.clearAccessToken).toBe(clearAccessToken);
    expect(tokenService.subscribe).toBe(subscribeToToken);
  });
});
