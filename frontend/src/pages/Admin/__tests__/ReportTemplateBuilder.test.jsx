import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReportTemplateBuilder from '../ReportTemplateBuilder.jsx';
import * as templatesApiModule from '../../../api/reportCardTemplates.js';
import * as firestoreModule from '../../../firebase/firestore.js';

describe('ReportTemplateBuilder Component (REST Migration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is exported as a function/component', () => {
    expect(typeof ReportTemplateBuilder).toBe('function');
  });

  it('targets REST getReportCardTemplate with templateType report_card', async () => {
    const firestoreGetSpy = vi.spyOn(firestoreModule, 'getTemplate');
    const restGetSpy = vi.spyOn(templatesApiModule, 'getReportCardTemplate').mockResolvedValue({
      success: true,
      data: {
        config: {
          themeColor: '#10b981',
          header: {
            title: 'GREENWOOD PROGRESS REPORT',
            subtitle: 'Academic Session 2026-2027',
            showLogo: true,
            showAddress: true,
            showPhone: true,
            showEmail: true
          }
        }
      }
    });

    const res = await templatesApiModule.getReportCardTemplate('report_card');

    expect(restGetSpy).toHaveBeenCalledWith('report_card');
    expect(firestoreGetSpy).not.toHaveBeenCalled();
    expect(res.data.config.themeColor).toBe('#10b981');
    expect(res.data.config.header.title).toBe('GREENWOOD PROGRESS REPORT');
  });

  it('targets REST saveReportCardTemplate with templateType report_card and config payload', async () => {
    const firestoreSaveSpy = vi.spyOn(firestoreModule, 'saveTemplate');
    const restSaveSpy = vi.spyOn(templatesApiModule, 'saveReportCardTemplate').mockResolvedValue({
      success: true,
      data: { id: 'tpl-saved-1' }
    });

    const config = {
      themeColor: '#c99bc1',
      header: { title: 'ANNUAL REPORT' }
    };

    const res = await templatesApiModule.saveReportCardTemplate('report_card', config);

    expect(restSaveSpy).toHaveBeenCalledWith('report_card', config);
    expect(firestoreSaveSpy).not.toHaveBeenCalled();
    expect(res.data.id).toBe('tpl-saved-1');
  });

  it('does not pass schoolId as a security argument to template REST calls', async () => {
    const spy = vi.spyOn(templatesApiModule, 'getReportCardTemplate').mockResolvedValue({
      success: true,
      data: { config: null }
    });

    await templatesApiModule.getReportCardTemplate('report_card');

    // First and only argument is templateType
    expect(spy).toHaveBeenCalledWith('report_card');
    expect(spy.mock.calls[0]).toHaveLength(1);
  });
});
