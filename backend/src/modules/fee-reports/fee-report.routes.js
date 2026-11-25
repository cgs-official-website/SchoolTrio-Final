import { Router } from 'express';
import * as controller from './fee-report.controller.js';
import * as schemas from './fee-report.schemas.js';
import * as concessionController from './concession-report.controller.js';
import * as concessionSchemas from './concession-report.schemas.js';
import * as studentConcession from './concession-student.controller.js';
import * as studentConcessionSchemas from './concession-student.schemas.js';
import * as cancellation from './cancellation-report.controller.js';
import * as cancellationSchemas from './cancellation-report.schemas.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantContext } from '../../middleware/tenant.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';

const router = Router();

// Every report needs a signed-in user of a school with read access to fees
const guard = [authenticate, tenantContext({ requireTenant: true }), requirePermission('fees', 'read')];

// Daily collection
router.get('/day', ...guard, validate(schemas.dayReportSchema), controller.getDayReport);
router.get('/daily-collection', ...guard, validate(schemas.dailyCollectionSchema), controller.getDailyCollection);
router.get(
  '/daily-collection/summary',
  ...guard,
  validate(schemas.dailyCollectionSchema),
  controller.getDailyCollectionSummary
);
router.get('/ledger/:studentId', ...guard, validate(schemas.ledgerSchema), controller.getStudentLedger);

// Concession reports
router.get(
  '/concessions',
  ...guard,
  validate(concessionSchemas.concessionReportSchema),
  concessionController.getConcessionReport
);
router.get(
  '/concessions/summary',
  ...guard,
  validate(concessionSchemas.concessionReportSchema),
  concessionController.getConcessionReportSummary
);
router.get(
  '/concessions/students',
  ...guard,
  validate(studentConcessionSchemas.studentConcessionSchema),
  studentConcession.getStudentConcessionReport
);
router.get(
  '/concessions/students/summary',
  ...guard,
  validate(studentConcessionSchemas.studentConcessionSchema),
  studentConcession.getStudentConcessionSummary
);
router.get(
  '/concessions/consolidated',
  ...guard,
  validate(studentConcessionSchemas.studentConcessionSchema),
  studentConcession.getConsolidatedConcessionReport
);
router.get(
  '/concessions/consolidated/summary',
  ...guard,
  validate(studentConcessionSchemas.studentConcessionSchema),
  studentConcession.getStudentConcessionSummary
);

// Cancellation reports
router.get(
  '/cancellations/invoices',
  ...guard,
  validate(cancellationSchemas.invoiceCancellationSchema),
  cancellation.getInvoiceCancellationReport
);
router.get(
  '/cancellations/invoices/summary',
  ...guard,
  validate(cancellationSchemas.invoiceCancellationSchema),
  cancellation.getInvoiceCancellationSummary
);
router.get(
  '/cancellations/categories',
  ...guard,
  validate(cancellationSchemas.categoryCancellationSchema),
  cancellation.getCategoryCancellationReport
);
router.get(
  '/cancellations/categories/summary',
  ...guard,
  validate(cancellationSchemas.categoryCancellationSchema),
  cancellation.getCategoryCancellationSummary
);

export default router;