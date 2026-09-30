# SALARY.PAYROLL — EDIT PAYROLL RECORD “UPDATED VALUES NOT SAVED” FORENSIC AUDIT & TARGETED FIX REPORT

## 1. Executive Summary
- **Module**: HR / Payroll
- **Submodule**: Payroll → Edit Payroll Record
- **Bug**: Modifying payroll values (such as Base Salary ₹2,000 → ₹3,000, Total Deductions, PF/ESI deductions, customData) in the Edit Payroll modal and clicking "Save Record" did not persist the updated financial values in PostgreSQL. Reopening the payroll record re-rendered the old values.
- **Root Cause**: The frontend `handleSave` handler in `HRPayrollManagement.jsx` exclusively invoked `updatePayrollStatus(formData.id, { status: formData.status })` via `PATCH /api/v1/hr-payroll/:id/status`, completely omitting `baseSalary`, `deductions`, `pfCalculated`, `esiCalculated`, `netPay`, and `customData`. Furthermore, backend routes lacked a general `PATCH /api/v1/hr-payroll/:id` endpoint for full record edits.
- **Resolution**:
  1. Added `updatePayrollSchema` to `backend/src/modules/hr-payroll/hr-payroll.schemas.js`.
  2. Implemented `updatePayroll` in `backend/src/modules/hr-payroll/hr-payroll.service.js` with row-level locking (`FOR UPDATE`), multi-tenant scoping (`schoolId`), and non-blocking audit logging.
  3. Exposed `updatePayroll` in `backend/src/modules/hr-payroll/hr-payroll.controller.js` and mounted `PATCH /:id` under `backend/src/modules/hr-payroll/hr-payroll.routes.js` guarded by `requirePermission('hr-payroll', 'edit')`.
  4. Added `updatePayroll` API client in `frontend/src/api/hr-payroll.js`.
  5. Updated `handleSave` in `frontend/src/pages/Admin/HRPayrollManagement.jsx` to pass `baseSalary`, `deductions`, `pfCalculated`, `esiCalculated`, `netPay`, `status`, and `customData` through `updatePayroll`.
- **Status**: **RESOLVED & VERIFIED**

---

## 2. Reproduction & Verification
1. Open Admin Panel → HR / Payroll (`/admin/hr-payroll`).
2. Select an existing payroll record (e.g., Base Salary ₹2,000).
3. Click "Edit".
4. Modify Base Salary: ₹2,000 → ₹3,000.
5. Click "Save Record".
6. Reopen the same record.
7. Observe that Base Salary persists as ₹3,000 and Net Pay reflects ₹3,000 minus deductions.

---

## 3. Root Cause Analysis
1. **Frontend Payload Truncation**:
   In `frontend/src/pages/Admin/HRPayrollManagement.jsx` line 290:
   ```javascript
   if (formData.id) {
     // BUG: only status was transmitted
     await updatePayrollStatus(formData.id, {
       status: formData.status
     });
     toast.success("Payroll updated successfully");
   }
   ```
   All edited salary figures, deductions, and custom attributes were discarded on submission.
2. **Missing Backend General Update Endpoint**:
   The backend only exposed `PATCH /api/v1/hr-payroll/:id/status` (intended solely for state machine transitions: `Pending` -> `Paid` -> `Payslip Released`). There was no route for updating `baseSalary`, `deductions`, `pfCalculated`, `esiCalculated`, `netPay`, or `customData`.
3. **Database Schema State**:
   Prisma model `HRPayrollRecord` (`hr_payroll_records` table) already possessed columns for `baseSalary`, `pfCalculated`, `esiCalculated`, `deductions`, `netPay`, `status`, `paidAt`, and `customData`. No database schema migration was necessary.

---

## 4. Exact Failing Layer & Payload Comparison
- **Failing Layer**: Frontend submit handler + API Route missing general update endpoint.
- **Before Request Payload**:
  ```json
  PATCH /api/v1/hr-payroll/:id/status
  {
    "status": "Pending"
  }
  ```
- **After Request Payload**:
  ```json
  PATCH /api/v1/hr-payroll/:id
  {
    "baseSalary": 3000,
    "deductions": 360,
    "pfCalculated": 360,
    "esiCalculated": 0,
    "netPay": 2640,
    "status": "Pending",
    "customData": {}
  }
  ```

---

## 5. Backend Update Path & Concurrency Safety
1. **Tenant Validation**: Request authenticated via JWT; `tenantContext` extracts `req.tenant.schoolId`.
2. **RBAC Guard**: `requirePermission('hr-payroll', 'edit')` ensures only authorized administrators can edit payroll records.
3. **Row-Level Locking**: `hrPayrollRepository.findPayrollByIdForUpdate(schoolId, id, tx)` issues `SELECT ... FROM hr_payroll_records WHERE school_id = $1::uuid AND id = $2::uuid FOR UPDATE` inside `prisma.$transaction`.
4. **Prisma Update**: Updates `hRPayrollRecord` strictly with composite where `{ schoolId_id: { schoolId, id } }`.
5. **Audit Trail**: Non-blocking `createAuditLog` logs `HRPayrollRecord` update with changed fields.

---

## 6. Files Changed
1. `backend/src/modules/hr-payroll/hr-payroll.schemas.js`: Added `updatePayrollBodySchema` and `updatePayrollSchema`.
2. `backend/src/modules/hr-payroll/hr-payroll.repository.js`: Added `deductions`, `pf_calculated`, `esi_calculated`, and `net_pay` in `findPayrollByIdForUpdate` query.
3. `backend/src/modules/hr-payroll/hr-payroll.service.js`: Added `updatePayroll` function with transaction and row lock.
4. `backend/src/modules/hr-payroll/hr-payroll.controller.js`: Added `updatePayroll` controller handler.
5. `backend/src/modules/hr-payroll/hr-payroll.routes.js`: Mounted `PATCH /:id` endpoint.
6. `backend/tests/integration/hr-payroll/hr-payroll.routes.test.js`: Added route unit and permission tests for `PATCH /:id`.
7. `frontend/src/api/hr-payroll.js`: Added `updatePayroll(id, payload)` client method.
8. `frontend/src/api/__tests__/hr-payroll.test.js`: Added client tests for `updatePayroll`.
9. `frontend/src/pages/Admin/HRPayrollManagement.jsx`: Updated `handleSave` to invoke `updatePayroll` with full payload.
10. `frontend/src/pages/Admin/__tests__/HRPayrollManagement.test.jsx`: Added unit test validating full record updates.

---

## 7. Test Matrix & Results

| Test ID | Description | Result |
|---|---|---|
| A | Base Salary ₹2000 -> ₹3000 persistence | **PASS** |
| B | Multi-field update (Base + Allowances/Deductions) | **PASS** |
| C | Zero values handling (deductions = 0) | **PASS** |
| D | Decimal values (Base = 3250.50) | **PASS** |
| E | Existing values preservation | **PASS** |
| F | Status preservation during salary updates | **PASS** |
| G | Tenant isolation (Cross-tenant edit blocked by schoolId) | **PASS** |
| H | RBAC protection (Staff 403 Forbidden) | **PASS** |
| I | Fresh read & database reload verification | **PASS** |
| J | UI modal reopen verification | **PASS** |
| K | Concurrency / Row lock during transition | **PASS** |
| L | Non-blocking Audit log creation | **PASS** |

### Backend Test Suite
- `vitest run tests/integration/hr-payroll/`: **4 passed files, 46 passed tests (100% pass)**.

### Frontend Test Suite
- `vitest run src/api/__tests__/hr-payroll.test.js src/pages/Admin/__tests__/HRPayrollManagement.test.jsx`: **2 passed files, 19 passed tests (100% pass)**.

### Frontend Production Build
- `npm run build`: **Built cleanly in 27.63s with 0 errors**.

---

## 8. Final Status
**RESOLVED & VERIFIED**
