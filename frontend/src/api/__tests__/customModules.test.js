import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import customModulesApi, {
  listCustomModules,
  getCustomModule,
  createCustomModule,
  updateCustomModule,
  deleteCustomModule,
  getFormSchema,
  upsertFormSchema,
  deleteFormSchema,
  listModuleRecords,
  getModuleRecord,
  createModuleRecord,
  updateModuleRecord,
  deleteModuleRecord
} from '../customModules.js';

describe('Custom Modules & Form Builder API Client Unit Tests (Phase FORMBUILDER.3)', () => {
  const MODULE_ID = '22222222-2222-4222-8222-222222222222';
  const RECORD_ID = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Custom Modules Metadata', () => {
    it('fetches list of custom modules', async () => {
      const mockModules = [{ id: MODULE_ID, name: 'Alumni Network' }];
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: mockModules
      });

      const res = await listCustomModules();
      expect(spy).toHaveBeenCalledWith('/api/v1/custom-modules', { method: 'GET' });
      expect(res.data).toEqual(mockModules);
    });

    it('fetches single custom module by id', async () => {
      const mockMod = { id: MODULE_ID, name: 'Alumni Network' };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: mockMod
      });

      const res = await getCustomModule(MODULE_ID);
      expect(spy).toHaveBeenCalledWith(`/api/v1/custom-modules/${MODULE_ID}`, { method: 'GET' });
      expect(res.data.name).toBe('Alumni Network');
    });

    it('creates custom module', async () => {
      const payload = { name: 'Hostel Gate Pass', icon: 'Folder' };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: MODULE_ID, ...payload }
      });

      const res = await createCustomModule(payload);
      expect(spy).toHaveBeenCalledWith('/api/v1/custom-modules', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      expect(res.data.name).toBe('Hostel Gate Pass');
    });

    it('updates custom module', async () => {
      const payload = { name: 'Renamed Module', isActive: true };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: MODULE_ID, ...payload }
      });

      const res = await updateCustomModule(MODULE_ID, payload);
      expect(spy).toHaveBeenCalledWith(`/api/v1/custom-modules/${MODULE_ID}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      expect(res.data.name).toBe('Renamed Module');
    });

    it('deletes custom module', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { message: 'Custom module deleted successfully' }
      });

      const res = await deleteCustomModule(MODULE_ID);
      expect(spy).toHaveBeenCalledWith(`/api/v1/custom-modules/${MODULE_ID}`, {
        method: 'DELETE'
      });
      expect(res.success).toBe(true);
    });
  });

  describe('2. Form Schemas', () => {
    it('retrieves form schema for a module key', async () => {
      const mockSchema = {
        moduleKey: 'staff',
        sections: [{ id: 'sec_1', title: 'Personal Details', fields: [] }]
      };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: mockSchema
      });

      const res = await getFormSchema('staff');
      expect(spy).toHaveBeenCalledWith('/api/v1/custom-modules/schemas/staff', { method: 'GET' });
      expect(res.data.sections.length).toBe(1);
    });

    it('upserts form schema', async () => {
      const payload = {
        sections: [{ id: 'sec_1', title: 'Custom Details', fields: [] }]
      };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { moduleKey: MODULE_ID, ...payload }
      });

      const res = await upsertFormSchema(MODULE_ID, payload);
      expect(spy).toHaveBeenCalledWith(`/api/v1/custom-modules/schemas/${MODULE_ID}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      expect(res.data.sections[0].title).toBe('Custom Details');
    });

    it('deletes form schema', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { message: 'Form schema deleted' }
      });

      const res = await deleteFormSchema(MODULE_ID);
      expect(spy).toHaveBeenCalledWith(`/api/v1/custom-modules/schemas/${MODULE_ID}`, {
        method: 'DELETE'
      });
      expect(res.success).toBe(true);
    });
  });

  describe('3. Dynamic Records', () => {
    it('lists records with pagination and search query', async () => {
      const mockRecords = [{ id: RECORD_ID, data: { name: 'John Doe' } }];
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: mockRecords,
        pagination: { page: 1, limit: 10, total: 1 }
      });

      const res = await listModuleRecords(MODULE_ID, { page: 1, limit: 10, search: 'John' });
      expect(spy).toHaveBeenCalledWith(
        `/api/v1/custom-modules/${MODULE_ID}/records?page=1&limit=10&search=John`,
        { method: 'GET' }
      );
      expect(res.data.length).toBe(1);
    });

    it('gets single record by id', async () => {
      const mockRecord = { id: RECORD_ID, data: { name: 'John Doe' } };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: mockRecord
      });

      const res = await getModuleRecord(MODULE_ID, RECORD_ID);
      expect(spy).toHaveBeenCalledWith(
        `/api/v1/custom-modules/${MODULE_ID}/records/${RECORD_ID}`,
        { method: 'GET' }
      );
      expect(res.data.id).toBe(RECORD_ID);
    });

    it('creates module record', async () => {
      const data = { f_name: 'Alice Smith', f_age: 30 };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: RECORD_ID, data }
      });

      const res = await createModuleRecord(MODULE_ID, data);
      expect(spy).toHaveBeenCalledWith(
        `/api/v1/custom-modules/${MODULE_ID}/records`,
        {
          method: 'POST',
          body: JSON.stringify({ data })
        }
      );
      expect(res.data.id).toBe(RECORD_ID);
    });

    it('updates module record', async () => {
      const data = { f_name: 'Alice Smith Updated' };
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: RECORD_ID, data }
      });

      const res = await updateModuleRecord(MODULE_ID, RECORD_ID, data);
      expect(spy).toHaveBeenCalledWith(
        `/api/v1/custom-modules/${MODULE_ID}/records/${RECORD_ID}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ data })
        }
      );
      expect(res.data.id).toBe(RECORD_ID);
    });

    it('deletes module record', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { message: 'Record deleted' }
      });

      const res = await deleteModuleRecord(MODULE_ID, RECORD_ID);
      expect(spy).toHaveBeenCalledWith(
        `/api/v1/custom-modules/${MODULE_ID}/records/${RECORD_ID}`,
        { method: 'DELETE' }
      );
      expect(res.success).toBe(true);
    });
  });

  describe('4. Export Integrity', () => {
    it('exports all 12 functions on default export object', () => {
      expect(typeof customModulesApi.listCustomModules).toBe('function');
      expect(typeof customModulesApi.getCustomModule).toBe('function');
      expect(typeof customModulesApi.createCustomModule).toBe('function');
      expect(typeof customModulesApi.updateCustomModule).toBe('function');
      expect(typeof customModulesApi.deleteCustomModule).toBe('function');
      expect(typeof customModulesApi.getFormSchema).toBe('function');
      expect(typeof customModulesApi.upsertFormSchema).toBe('function');
      expect(typeof customModulesApi.deleteFormSchema).toBe('function');
      expect(typeof customModulesApi.listModuleRecords).toBe('function');
      expect(typeof customModulesApi.getModuleRecord).toBe('function');
      expect(typeof customModulesApi.createModuleRecord).toBe('function');
      expect(typeof customModulesApi.updateModuleRecord).toBe('function');
      expect(typeof customModulesApi.deleteModuleRecord).toBe('function');
    });
  });
});
