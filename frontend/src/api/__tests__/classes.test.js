import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as clientModule from '../client.js';
import {
  listClasses,
  getClass,
  createClass,
  updateClass,
  deleteClass,
  listSections,
  createSection,
  updateSection,
  deleteSection,
  listClassCategories,
  createClassCategory,
  deleteClassCategory,
  classesApi
} from '../classes.js';

describe('Classes API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists classes with query params', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: [{ id: 'cls-1', name: 'Grade 10' }],
      pagination: { total: 1, page: 1, limit: 100 }
    });

    const res = await listClasses({ limit: 100 });
    expect(spy).toHaveBeenCalledWith('/api/v1/classes?limit=100', {
      method: 'GET'
    });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe('cls-1');
  });

  it('retrieves single class by ID', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'cls-1', name: 'Grade 10' }
    });

    const res = await getClass('cls-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/classes/cls-1', {
      method: 'GET'
    });
    expect(res.data.name).toBe('Grade 10');
  });

  it('creates class with payload', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'cls-1', name: 'Grade 10', defaultSection: 'A' }
    });

    const res = await createClass({ name: 'Grade 10', defaultSection: 'A' });
    expect(spy).toHaveBeenCalledWith('/api/v1/classes', {
      method: 'POST',
      body: JSON.stringify({ name: 'Grade 10', defaultSection: 'A' })
    });
    expect(res.data.id).toBe('cls-1');
  });

  it('updates class by ID', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'cls-1', name: 'Grade 10 - Updated' }
    });

    const res = await updateClass('cls-1', { name: 'Grade 10 - Updated' });
    expect(spy).toHaveBeenCalledWith('/api/v1/classes/cls-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Grade 10 - Updated' })
    });
    expect(res.data.name).toBe('Grade 10 - Updated');
  });

  it('deletes class by ID', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      message: 'Class deleted successfully'
    });

    const res = await deleteClass('cls-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/classes/cls-1', {
      method: 'DELETE'
    });
    expect(res.success).toBe(true);
  });

  it('lists sections for a class', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: [{ id: 'sec-1', name: 'A', classId: 'cls-1' }]
    });

    const res = await listSections('cls-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/classes/cls-1/sections', {
      method: 'GET'
    });
    expect(res.data).toHaveLength(1);
  });

  it('creates section for a class', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'sec-2', name: 'B', classId: 'cls-1' }
    });

    const res = await createSection('cls-1', { name: 'B' });
    expect(spy).toHaveBeenCalledWith('/api/v1/classes/cls-1/sections', {
      method: 'POST',
      body: JSON.stringify({ name: 'B' })
    });
    expect(res.data.id).toBe('sec-2');
  });

  it('updates section for a class', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'sec-1', name: 'Alpha' }
    });

    const res = await updateSection('cls-1', 'sec-1', { name: 'Alpha' });
    expect(spy).toHaveBeenCalledWith('/api/v1/classes/cls-1/sections/sec-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Alpha' })
    });
    expect(res.data.name).toBe('Alpha');
  });

  it('deletes section for a class', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      message: 'Section deleted successfully'
    });

    const res = await deleteSection('cls-1', 'sec-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/classes/cls-1/sections/sec-1', {
      method: 'DELETE'
    });
    expect(res.success).toBe(true);
  });

  it('lists class categories', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: [{ id: 'cat-1', name: 'Primary' }]
    });

    const res = await listClassCategories();
    expect(spy).toHaveBeenCalledWith('/api/v1/class-categories', {
      method: 'GET'
    });
    expect(res.data).toHaveLength(1);
  });

  it('creates class category', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { id: 'cat-1', name: 'Secondary' }
    });

    const res = await createClassCategory({ name: 'Secondary' });
    expect(spy).toHaveBeenCalledWith('/api/v1/class-categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Secondary' })
    });
    expect(res.data.id).toBe('cat-1');
  });

  it('deletes class category by ID', async () => {
    const spy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({
      success: true,
      message: 'Category deleted successfully'
    });

    const res = await deleteClassCategory('cat-1');
    expect(spy).toHaveBeenCalledWith('/api/v1/class-categories/cat-1', {
      method: 'DELETE'
    });
    expect(res.success).toBe(true);
  });

  it('exports object bundle classesApi with all methods', () => {
    expect(classesApi.listClasses).toBe(listClasses);
    expect(classesApi.getClass).toBe(getClass);
    expect(classesApi.createClass).toBe(createClass);
    expect(classesApi.updateClass).toBe(updateClass);
    expect(classesApi.deleteClass).toBe(deleteClass);
    expect(classesApi.listSections).toBe(listSections);
    expect(classesApi.createSection).toBe(createSection);
    expect(classesApi.updateSection).toBe(updateSection);
    expect(classesApi.deleteSection).toBe(deleteSection);
    expect(classesApi.listClassCategories).toBe(listClassCategories);
    expect(classesApi.createClassCategory).toBe(createClassCategory);
    expect(classesApi.deleteClassCategory).toBe(deleteClassCategory);
  });
});
