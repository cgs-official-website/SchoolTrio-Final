import { Router } from 'express';
import * as inventoryController from './inventory.controller.js';
import * as inventorySchemas from './inventory.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

const inventoryRouter = Router();

// Apply authentication and strict tenant resolution
inventoryRouter.use(authenticate);
inventoryRouter.use(tenantContext({ requireTenant: true }));

// ==========================================
// 1. Categories Endpoints
// ==========================================

inventoryRouter.get(
  '/categories',
  requirePermission('inventory', 'read'),
  inventoryController.listCategories
);

inventoryRouter.post(
  '/categories',
  requirePermission('inventory', 'create'),
  validate(inventorySchemas.createCategorySchema),
  inventoryController.createCategory
);

inventoryRouter.put(
  '/categories/:id',
  requirePermission('inventory', 'edit'),
  validate(inventorySchemas.updateCategorySchema),
  inventoryController.updateCategory
);

inventoryRouter.delete(
  '/categories/:id',
  requirePermission('inventory', 'delete'),
  validate(inventorySchemas.categoryIdParamSchema),
  inventoryController.deleteCategory
);

// ==========================================
// 2. Audit Logs Endpoints
// ==========================================

inventoryRouter.get(
  '/audit-logs',
  requirePermission('inventory', 'read'),
  validate(inventorySchemas.listAuditLogsSchema),
  inventoryController.listAuditLogs
);

// ==========================================
// 3. Inventory Items Endpoints
// ==========================================

inventoryRouter.get(
  '/items',
  requirePermission('inventory', 'read'),
  validate(inventorySchemas.listItemsSchema),
  inventoryController.listItems
);

inventoryRouter.get(
  '/items/:id',
  requirePermission('inventory', 'read'),
  validate(inventorySchemas.itemIdParamSchema),
  inventoryController.getItemById
);

inventoryRouter.post(
  '/items',
  requirePermission('inventory', 'create'),
  validate(inventorySchemas.createItemSchema),
  inventoryController.createItem
);

inventoryRouter.put(
  '/items/:id',
  requirePermission('inventory', 'edit'),
  validate(inventorySchemas.updateItemSchema),
  inventoryController.updateItem
);

inventoryRouter.delete(
  '/items/:id',
  requirePermission('inventory', 'delete'),
  validate(inventorySchemas.itemIdParamSchema),
  inventoryController.deleteItem
);

inventoryRouter.post(
  '/items/bulk-delete',
  requirePermission('inventory', 'delete'),
  validate(inventorySchemas.bulkDeleteItemsSchema),
  inventoryController.bulkDeleteItems
);

inventoryRouter.post(
  '/items/bulk-import',
  requirePermission('inventory', 'create'),
  validate(inventorySchemas.bulkImportSchema),
  inventoryController.bulkImportItems
);

inventoryRouter.post(
  '/items/:id/adjust',
  requirePermission('inventory', 'edit'),
  validate(inventorySchemas.adjustStockSchema),
  inventoryController.adjustStock
);

export { inventoryRouter as inventoryRoutes };
export default inventoryRouter;
