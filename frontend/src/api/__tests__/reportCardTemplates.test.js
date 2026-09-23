import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getReportCardTemplate,
  saveReportCardTemplate,
  deleteReportCardTemplate,
  reportCardTemplatesApi
} from '../reportCardTemplates.js';
import * as clientModule from '../client.js';

describe('reportCardTemplatesApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getReportCardTemplate', () => {
    it('calls GET /api/v1/report-card-templates/:templateType with default report_card', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { templateType: 'report_card', config: { themeColor: '#3b82f6' } }
      });

      const res = await getReportCardTemplate();

      expect(spy).toHaveBeenCalledWith('/api/v1/report-card-templates/report_card', {
        method: 'GET'
      });
      expect(res.data.config.themeColor).toBe('#3b82f6');
    });

    it('encodes custom templateType in URI', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { templateType: 'custom_type' }
      });

      await getReportCardTemplate('custom_type');

      expect(spy).toHaveBeenCalledWith('/api/v1/report-card-templates/custom_type', {
        method: 'GET'
      });
    });
  });

  describe('saveReportCardTemplate', () => {
    it('calls PUT /api/v1/report-card-templates/:templateType with { config }', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { id: 'tpl-1', config: { themeColor: '#ff0000' } }
      });

      const config = { themeColor: '#ff0000', header: { title: 'MY REPORT' } };
      const res = await saveReportCardTemplate('report_card', config);

      expect(spy).toHaveBeenCalledWith('/api/v1/report-card-templates/report_card', {
        method: 'PUT',
        body: JSON.stringify({ config })
      });
      expect(res.data.id).toBe('tpl-1');
    });
  });

  describe('deleteReportCardTemplate', () => {
    it('calls DELETE /api/v1/report-card-templates/:templateType', async () => {
      const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: { message: 'Template reset to default' }
      });

      const res = await deleteReportCardTemplate('report_card');

      expect(spy).toHaveBeenCalledWith('/api/v1/report-card-templates/report_card', {
        method: 'DELETE'
      });
      expect(res.data.message).toBe('Template reset to default');
    });
  });

  describe('default export', () => {
    it('contains all methods', () => {
      expect(reportCardTemplatesApi.getReportCardTemplate).toBe(getReportCardTemplate);
      expect(reportCardTemplatesApi.saveReportCardTemplate).toBe(saveReportCardTemplate);
      expect(reportCardTemplatesApi.deleteReportCardTemplate).toBe(deleteReportCardTemplate);
    });
  });
});
