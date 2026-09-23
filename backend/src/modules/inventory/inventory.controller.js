import * as inventoryService from './inventory.service.js';

// ==========================================
// 1. Categories Controller
// ==========================================

export const listCategories = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const categories = await inventoryService.listCategories(schoolId);
    res.status(200).json({
      success: true,
      data: categories
    });
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const category = await inventoryService.createCategory(schoolId, req.body);
    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category
    });
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const { id } = req.params;
    const category = await inventoryService.updateCategory(schoolId, id, req.body);
    res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      data: category
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const { id } = req.params;
    await inventoryService.deleteCategory(schoolId, id);
    res.status(200).json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. Inventory Items Controller
// ==========================================

export const listItems = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const { items, total } = await inventoryService.listItems(schoolId, req.query);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;

    res.status(200).json({
      success: true,
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getItemById = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const { id } = req.params;
    const item = await inventoryService.getItemById(schoolId, id);
    res.status(200).json({
      success: true,
      data: item
    });
  } catch (error) {
    next(error);
  }
};

export const createItem = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const user = req.user || {};
    const item = await inventoryService.createItem(schoolId, req.body, user);
    res.status(201).json({
      success: true,
      message: 'Item added successfully',
      data: item
    });
  } catch (error) {
    next(error);
  }
};

export const updateItem = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const { id } = req.params;
    const user = req.user || {};
    const item = await inventoryService.updateItem(schoolId, id, req.body, user);
    res.status(200).json({
      success: true,
      message: 'Item updated successfully',
      data: item
    });
  } catch (error) {
    next(error);
  }
};

export const deleteItem = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const { id } = req.params;
    await inventoryService.deleteItem(schoolId, id);
    res.status(200).json({
      success: true,
      message: 'Item deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteItems = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const result = await inventoryService.bulkDeleteItems(schoolId, req.body.itemIds);
    res.status(200).json({
      success: true,
      message: 'Bulk delete completed',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. Stock Adjustment Controller
// ==========================================

export const adjustStock = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const { id } = req.params;
    const user = req.user || {};
    const result = await inventoryService.adjustStock(schoolId, id, req.body, user);
    res.status(200).json({
      success: true,
      message: 'Stock adjusted successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 4. Bulk Import Controller
// ==========================================

export const bulkImportItems = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const user = req.user || {};
    const result = await inventoryService.bulkImportItems(schoolId, req.body, user);
    res.status(200).json({
      success: true,
      message: 'Bulk import completed successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 5. Audit Logs Controller
// ==========================================

export const listAuditLogs = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const { logs, total } = await inventoryService.listAuditLogs(schoolId, req.query);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;

    res.status(200).json({
      success: true,
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};
