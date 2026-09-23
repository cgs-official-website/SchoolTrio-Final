import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as rbacApi from '../rbac.js';
import * as clientModule from '../client.js';

vi.mock('../client.js', () => ({
  apiClient: vi.fn()
}));

describe('RBAC API Client (src/api/rbac.js)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. getMyPermissions calls GET /api/v1/rbac/my-permissions', async () => {
    vi.spyOn(clientModule, 'apiClient').mockResolvedValueOnce({
      success: true,
      data: { isUnrestricted: true, permissions: {} }
    });

    const res = await rbacApi.getMyPermissions();
    expect(clientModule.apiClient).toHaveBeenCalledWith('/api/v1/rbac/my-permissions', {
      method: 'GET'
    });
    expect(res.success).toBe(true);
  });

  it('2. getRoles calls GET /api/v1/rbac/roles', async () => {
    vi.spyOn(clientModule, 'apiClient').mockResolvedValueOnce({
      success: true,
      data: [{ id: 'role-1', name: 'Principal' }]
    });

    const res = await rbacApi.getRoles();
    expect(clientModule.apiClient).toHaveBeenCalledWith('/api/v1/rbac/roles', {
      method: 'GET'
    });
    expect(res.data).toHaveLength(1);
  });

  it('3. getRoleById calls GET /api/v1/rbac/roles/:roleId', async () => {
    vi.spyOn(clientModule, 'apiClient').mockResolvedValueOnce({
      success: true,
      data: { id: 'role-123', name: 'Teacher' }
    });

    const res = await rbacApi.getRoleById('role-123');
    expect(clientModule.apiClient).toHaveBeenCalledWith('/api/v1/rbac/roles/role-123', {
      method: 'GET'
    });
    expect(res.data.id).toBe('role-123');
  });

  it('4. createRole calls POST /api/v1/rbac/roles with payload', async () => {
    vi.spyOn(clientModule, 'apiClient').mockResolvedValueOnce({
      success: true,
      data: { id: 'role-new', name: 'Exam Head' }
    });

    const payload = { name: 'Exam Head', loginPanel: 'teacher', permissions: {} };
    const res = await rbacApi.createRole(payload);
    expect(clientModule.apiClient).toHaveBeenCalledWith('/api/v1/rbac/roles', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    expect(res.data.id).toBe('role-new');
  });

  it('5. updateRole calls PATCH /api/v1/rbac/roles/:roleId with payload', async () => {
    vi.spyOn(clientModule, 'apiClient').mockResolvedValueOnce({
      success: true,
      data: { id: 'role-123', name: 'Updated Name' }
    });

    const payload = { name: 'Updated Name' };
    const res = await rbacApi.updateRole('role-123', payload);
    expect(clientModule.apiClient).toHaveBeenCalledWith('/api/v1/rbac/roles/role-123', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    expect(res.data.name).toBe('Updated Name');
  });

  it('6. deleteRole calls DELETE /api/v1/rbac/roles/:roleId', async () => {
    vi.spyOn(clientModule, 'apiClient').mockResolvedValueOnce({
      success: true,
      message: 'Role deleted'
    });

    const res = await rbacApi.deleteRole('role-123');
    expect(clientModule.apiClient).toHaveBeenCalledWith('/api/v1/rbac/roles/role-123', {
      method: 'DELETE'
    });
    expect(res.success).toBe(true);
  });

  it('7. updateRolePermissions calls PUT /api/v1/rbac/roles/:roleId/permissions', async () => {
    vi.spyOn(clientModule, 'apiClient').mockResolvedValueOnce({
      success: true,
      data: []
    });

    const payload = { permissions: { classes: { canRead: true, canCreate: true } } };
    const res = await rbacApi.updateRolePermissions('role-123', payload);
    expect(clientModule.apiClient).toHaveBeenCalledWith('/api/v1/rbac/roles/role-123/permissions', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    expect(res.success).toBe(true);
  });

  it('8. user role assignment endpoints call correct paths', async () => {
    vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ success: true });

    await rbacApi.getUserRoles('user-1');
    expect(clientModule.apiClient).toHaveBeenCalledWith('/api/v1/rbac/users/user-1/roles', {
      method: 'GET'
    });

    await rbacApi.assignUserRole('user-1', 'role-1');
    expect(clientModule.apiClient).toHaveBeenCalledWith('/api/v1/rbac/users/user-1/roles', {
      method: 'POST',
      body: JSON.stringify({ roleId: 'role-1' })
    });

    await rbacApi.removeUserRole('user-1', 'role-1');
    expect(clientModule.apiClient).toHaveBeenCalledWith('/api/v1/rbac/users/user-1/roles/role-1', {
      method: 'DELETE'
    });
  });
});
