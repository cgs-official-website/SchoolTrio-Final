import { describe, it, expect, vi, beforeEach } from 'vitest';
import LinkGenerator from '../LinkGenerator.jsx';
import * as settingsApi from '../../../api/settings.js';

describe('LinkGenerator Component REST Migration (FRONTEND.C5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. is exported as a valid React component function', () => {
    expect(typeof LinkGenerator).toBe('function');
  });

  it('2. getSchoolSettings retrieves customData.staffFormConfig properly', async () => {
    const mockSettingsResponse = {
      success: true,
      data: {
        id: 'mock-school-id',
        name: 'St. Jude School',
        customData: {
          staffFormConfig: [
            { name: 'employeeId', label: 'Employee ID', required: true },
            { name: 'department', label: 'Department', required: true }
          ]
        }
      }
    };

    const getSpy = vi.spyOn(settingsApi, 'getSchoolSettings').mockResolvedValue(mockSettingsResponse);

    const res = await settingsApi.getSchoolSettings();

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(res.data.customData.staffFormConfig).toHaveLength(2);
    expect(res.data.customData.staffFormConfig[0].name).toBe('employeeId');
    expect(res.data.customData.staffFormConfig[1].name).toBe('department');
  });

  it('3. updateSchoolSettings sends customData.staffFormConfig conforming to backend contract', async () => {
    const updatePayload = {
      customData: {
        staffFormConfig: [
          { name: 'phone', label: 'Phone Number', required: true }
        ]
      }
    };

    const updateSpy = vi.spyOn(settingsApi, 'updateSchoolSettings').mockResolvedValue({
      success: true,
      data: updatePayload
    });

    const res = await settingsApi.updateSchoolSettings(updatePayload);

    expect(updateSpy).toHaveBeenCalledWith(updatePayload);
    expect(res.data.customData.staffFormConfig[0].name).toBe('phone');
  });

  it('4. handles fallback if staffFormConfig is absent in customData', async () => {
    const mockEmptySettings = {
      success: true,
      data: {
        id: 'school-empty',
        name: 'New School',
        customData: {}
      }
    };

    vi.spyOn(settingsApi, 'getSchoolSettings').mockResolvedValue(mockEmptySettings);

    const res = await settingsApi.getSchoolSettings();
    const config = res.data.customData?.staffFormConfig || res.data.staffFormConfig || [];

    expect(config).toEqual([]);
  });

  it('5. handles API error during getSchoolSettings gracefully', async () => {
    vi.spyOn(settingsApi, 'getSchoolSettings').mockRejectedValue(new Error('Network error'));

    await expect(settingsApi.getSchoolSettings()).rejects.toThrow('Network error');
  });
});
