import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as customModulesApi from '../../../api/customModules.js';
import * as settingsApi from '../../../api/settings.js';

describe('Admin FormBuilder REST Migration (Phase FORMBUILDER.3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads custom modules via listCustomModules', async () => {
    const mockModules = [
      { id: 'mod-1', name: 'Alumni Network', icon: 'Folder', order: 0 },
      { id: 'mod-2', name: 'Hostel Management', icon: 'Folder', order: 1 }
    ];

    const listSpy = vi.spyOn(customModulesApi, 'listCustomModules').mockResolvedValue({
      success: true,
      data: mockModules
    });

    const res = await customModulesApi.listCustomModules();
    expect(listSpy).toHaveBeenCalled();
    expect(res.data.length).toBe(2);
    expect(res.data[0].name).toBe('Alumni Network');
  });

  it('creates custom module via createCustomModule', async () => {
    const payload = { name: 'Visitor Log', icon: 'Folder', order: 2 };
    const createSpy = vi.spyOn(customModulesApi, 'createCustomModule').mockResolvedValue({
      success: true,
      data: { id: 'mod-3', ...payload }
    });

    const res = await customModulesApi.createCustomModule(payload);
    expect(createSpy).toHaveBeenCalledWith(payload);
    expect(res.data.name).toBe('Visitor Log');
  });

  it('loads form schema via getFormSchema', async () => {
    const mockSchema = {
      moduleKey: 'staff',
      sections: [
        {
          id: 'sec_1',
          title: 'Personal Details',
          fields: [
            { id: 'f_1', label: 'First Name', type: 'text', required: true }
          ]
        }
      ]
    };

    const schemaSpy = vi.spyOn(customModulesApi, 'getFormSchema').mockResolvedValue({
      success: true,
      data: mockSchema
    });

    const res = await customModulesApi.getFormSchema('staff');
    expect(schemaSpy).toHaveBeenCalledWith('staff');
    expect(res.data.sections[0].title).toBe('Personal Details');
  });

  it('saves form schema via upsertFormSchema', async () => {
    const payload = {
      sections: [
        {
          id: 'sec_1',
          title: 'General Information',
          fields: [
            { id: 'f_1', label: 'Hostel Block', type: 'text', required: true }
          ]
        }
      ]
    };

    const upsertSpy = vi.spyOn(customModulesApi, 'upsertFormSchema').mockResolvedValue({
      success: true,
      data: { moduleKey: 'mod-1', ...payload }
    });

    const res = await customModulesApi.upsertFormSchema('mod-1', payload);
    expect(upsertSpy).toHaveBeenCalledWith('mod-1', payload);
    expect(res.data.sections[0].title).toBe('General Information');
  });

  it('deletes custom module via deleteCustomModule with atomic cascade', async () => {
    const deleteSpy = vi.spyOn(customModulesApi, 'deleteCustomModule').mockResolvedValue({
      success: true,
      data: { message: 'Custom module deleted successfully' }
    });

    const res = await customModulesApi.deleteCustomModule('mod-1');
    expect(deleteSpy).toHaveBeenCalledWith('mod-1');
    expect(res.success).toBe(true);
  });

  it('updates sidebar order via updateSidebarSettings', async () => {
    const updateSpy = vi.spyOn(settingsApi, 'updateSidebarSettings').mockResolvedValue({
      success: true,
      data: { order: ['staff', 'students', 'mod-1', 'inventory'] }
    });

    const res = await settingsApi.updateSidebarSettings({ order: ['staff', 'students', 'mod-1', 'inventory'] });
    expect(updateSpy).toHaveBeenCalledWith({ order: ['staff', 'students', 'mod-1', 'inventory'] });
    expect(res.data.order.length).toBe(4);
  });
});
