import { Router } from 'express';
import * as libraryController from './library.controller.js';
import * as librarySchemas from './library.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

const libraryRouter = Router();

// Apply base authentication and strict tenant resolution to all library routes
libraryRouter.use(authenticate);
libraryRouter.use(tenantContext({ requireTenant: true }));

// ==========================================
// 1. Categories Endpoints
// ==========================================

libraryRouter.get(
  '/categories',
  requirePermission('library', 'read'),
  libraryController.listCategories
);

libraryRouter.post(
  '/categories',
  requirePermission('library', 'create'),
  validate(librarySchemas.createCategorySchema),
  libraryController.createCategory
);

// ==========================================
// 2. Issues & Returns Endpoints
// ==========================================

libraryRouter.get(
  '/issues',
  requirePermission('library', 'read'),
  validate(librarySchemas.listIssuesSchema),
  libraryController.listIssues
);

libraryRouter.post(
  '/issues',
  requirePermission('library', 'edit'),
  validate(librarySchemas.issueBookSchema),
  libraryController.issueBook
);

libraryRouter.post(
  '/issues/:id/return',
  requirePermission('library', 'edit'),
  validate(librarySchemas.libraryIdParamSchema),
  libraryController.returnBook
);

// ==========================================
// 3. Books Endpoints
// ==========================================

libraryRouter.get(
  '/books',
  requirePermission('library', 'read'),
  validate(librarySchemas.listBooksSchema),
  libraryController.listBooks
);

libraryRouter.get(
  '/books/:id',
  requirePermission('library', 'read'),
  validate(librarySchemas.libraryIdParamSchema),
  libraryController.getBookById
);

libraryRouter.post(
  '/books',
  requirePermission('library', 'create'),
  validate(librarySchemas.createBookSchema),
  libraryController.createBook
);

libraryRouter.patch(
  '/books/:id',
  requirePermission('library', 'edit'),
  validate(librarySchemas.updateBookSchema),
  libraryController.updateBook
);

libraryRouter.delete(
  '/books/:id',
  requirePermission('library', 'delete'),
  validate(librarySchemas.libraryIdParamSchema),
  libraryController.deleteBook
);

export { libraryRouter as libraryRoutes };
export default libraryRouter;
