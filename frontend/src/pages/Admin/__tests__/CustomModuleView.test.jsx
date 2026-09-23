import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as customModulesApi from '../../../api/customModules.js';

describe('Admin CustomModuleView REST Migration (Phase FORMBUILDER.3)', () => {
  const MODULE_ID = 'mod-123';
  const RECORD_ID = 'rec-456';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads module metadata via getCustomModule', async () => {
    const mockMeta = {
      id: MODULE_ID,
      name: 'Hostel Management',
      icon: 'Folder'
    };

    const metaSpy = vi.spyOn(customModulesApi, 'getCustomModule').mockResolvedValue({
      success: true,
      data: mockMeta
    });

    const res = await customModulesApi.getCustomModule(MODULE_ID);
    expect(metaSpy).toHaveBeenCalledWith(MODULE_ID);
    expect(res.data.name).toBe('Hostel Management');
  });

  it('loads form schema via getFormSchema', async () => {
    const mockSchema = {
      moduleKey: MODULE_ID,
      sections: [
        {
          id: 'sec_1',
          title: 'Room Assignment',
          fields: [
            { id: 'f_room', label: 'Room Number', type: 'text', required: true },
            { id: 'f_bed', label: 'Bed Count', type: 'number', required: true }
          ]
        }
      ]
    };

    const schemaSpy = vi.spyOn(customModulesApi, 'getFormSchema').mockResolvedValue({
      success: true,
      data: mockSchema
    });

    const res = await customModulesApi.getFormSchema(MODULE_ID);
    expect(schemaSpy).toHaveBeenCalledWith(MODULE_ID);
    expect(res.data.sections[0].fields.length).toBe(2);
  });

  it('loads dynamic records via listModuleRecords', async () => {
    const mockRecords = [
      { id: RECORD_ID, data: { f_room: '101A', f_bed: 2 } },
      { id: 'rec-457', data: { f_room: '102B', f_bed: 3 } }
    ];

    const recordsSpy = vi.spyOn(customModulesApi, 'listModuleRecords').mockResolvedValue({
      success: true,
      data: mockRecords,
      pagination: { total: 2, page: 1, limit: 100 }
    });

    const res = await customModulesApi.listModuleRecords(MODULE_ID, { limit: 100 });
    expect(recordsSpy).toHaveBeenCalledWith(MODULE_ID, { limit: 100 });
    expect(res.data.length).toBe(2);
    expect(res.data[0].data.f_room).toBe('101A');
  });

  it('creates dynamic record via createModuleRecord', async () => {
    const recordPayload = { f_room: '103C', f_bed: 1 };
    const createSpy = vi.spyOn(customModulesApi, 'createModuleRecord').mockResolvedValue({
      success: true,
      data: { id: 'rec-458', data: recordPayload }
    });

    const res = await customModulesApi.createModuleRecord(MODULE_ID, recordPayload);
    expect(createSpy).toHaveBeenCalledWith(MODULE_ID, recordPayload);
    expect(res.data.data.f_room).toBe('103C');
  });

  it('updates dynamic record via updateModuleRecord', async () => {
    const recordPayload = { f_room: '101A-Renovated', f_bed: 2 };
    const updateSpy = vi.spyOn(customModulesApi, 'updateModuleRecord').mockResolvedValue({
      success: true,
      data: { id: RECORD_ID, data: recordPayload }
    });

    const res = await customModulesApi.updateModuleRecord(MODULE_ID, RECORD_ID, recordPayload);
    expect(updateSpy).toHaveBeenCalledWith(MODULE_ID, RECORD_ID, recordPayload);
    expect(res.data.data.f_room).toBe('101A-Renovated');
  });

  it('deletes dynamic record via deleteModuleRecord', async () => {
    const deleteSpy = vi.spyOn(customModulesApi, 'deleteModuleRecord').mockResolvedValue({
      success: true,
      data: { message: 'Record deleted successfully' }
    });

    const res = await customModulesApi.deleteModuleRecord(MODULE_ID, RECORD_ID);
    expect(deleteSpy).toHaveBeenCalledWith(MODULE_ID, RECORD_ID);
    expect(res.success).toBe(true);
  });
});
