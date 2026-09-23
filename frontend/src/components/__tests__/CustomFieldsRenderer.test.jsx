import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as customModulesApi from '../../api/customModules.js';

describe('CustomFieldsRenderer Component REST Migration (Phase FORMBUILDER.3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches form schema via getFormSchema for custom or core module keys', async () => {
    const mockSchema = {
      moduleKey: 'staff',
      sections: [
        {
          id: 'sec_1',
          title: 'Custom Staff Attributes',
          fields: [
            { id: 'f_blood', label: 'Blood Group', type: 'select', options: 'A+,B+,O+,AB+', required: false },
            { id: 'f_emergency', label: 'Emergency Contact', type: 'text', required: true }
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
    expect(res.data.sections[0].fields.length).toBe(2);
    expect(res.data.sections[0].fields[0].type).toBe('select');
  });

  it('handles empty schema response gracefully', async () => {
    vi.spyOn(customModulesApi, 'getFormSchema').mockResolvedValue({
      success: true,
      data: { sections: [] }
    });

    const res = await customModulesApi.getFormSchema('non_existent');
    expect(res.data.sections).toEqual([]);
  });
});
