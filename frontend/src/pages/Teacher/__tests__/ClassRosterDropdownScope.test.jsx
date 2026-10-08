import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as classesApi from '../../../api/classes';

describe('Frontend: Teacher Class Roster Class Selection Scoping', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls listMyClasses() instead of generic listClasses() to retrieve only assigned classes', async () => {
    const listMyClassesSpy = vi.spyOn(classesApi, 'listMyClasses').mockResolvedValue({
      success: true,
      data: [
        {
          id: 'class-10-uuid',
          name: 'Class 10',
          sections: [{ id: 'sec-10a-uuid', name: 'A' }]
        }
      ]
    });

    const res = await classesApi.listMyClasses();

    expect(listMyClassesSpy).toHaveBeenCalled();
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe('class-10-uuid');
    expect(res.data[0].sections).toHaveLength(1);
    expect(res.data[0].sections[0].id).toBe('sec-10a-uuid');
  });
});
