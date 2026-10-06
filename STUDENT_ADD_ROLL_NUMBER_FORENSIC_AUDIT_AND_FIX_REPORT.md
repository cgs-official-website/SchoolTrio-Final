# STUDENT.ADD — ROLL NUMBER FIELD FORENSIC AUDIT & TARGETED FIX REPORT

**Bug ID:** `STUDENT-ADD-ROLL-001`  
**Module:** Student Management  
**Submodule:** Add Student  
**Bug Title:** Roll Number field is missing in Add Student but displayed in View Details  
**Severity:** MEDIUM  
**Priority:** MEDIUM  
**Status:** **RESOLVED — AUTOMATED VERIFICATION PASSED; MANUAL BROWSER VERIFICATION PENDING**  

---

## 1. Executive Summary

In Student Management, the "View Details" and "Edit Student" interfaces already displayed and edited a student's `Roll Number`. However, the "Add Student" admission form lacked an input field for `Roll Number`, and the form submission handler did not include `rollNumber` in the creation payload sent to the backend.

A comprehensive full-stack audit revealed that:
1. The PostgreSQL database (`students.roll_number`), Prisma schema (`rollNumber String? @map("roll_number") @db.VarChar(50)`), backend Zod validation schema (`student.schemas.js`), backend service (`student.service.js`), and repository (`student.repository.js`) were already fully implemented and verified for `rollNumber`.
2. The root cause was purely in `frontend/src/pages/Admin/StudentManagement.jsx`:
   - `getInitialStudentFormData()` did not initialize `rollNumber: ''`.
   - The Add Student form omitted a Roll Number input under the "Academic Information" section.
   - `handleAddStudent` validation did not check for duplicate Roll Numbers within the class.
   - `handleAddStudent` did not include `rollNumber` in the `createStudent` API payload.

A targeted fix was implemented to wire the canonical `rollNumber` field through the Add Student form lifecycle. All unit tests (27 frontend, 70 backend) and the production build passed with 0 errors.

---

## 2. Source of Truth Table

| Layer | Current Roll Number Property | Status / Support |
|---|---|---|
| **Prisma Student** | `rollNumber String? @map("roll_number") @db.VarChar(50)` | Native schema field |
| **PostgreSQL** | `students.roll_number` | Native column (VARCHAR 50) |
| **Backend Schemas** | `student.schemas.js` (`createStudentSchema`, `updateStudentSchema`) | Validated via `z.string().trim().max(50)` |
| **Backend Service** | `student.service.js` (`createStudent`, `updateStudent`) | Trimmed & persisted |
| **Backend Repository** | `student.repository.js` | Selected & queried |
| **GET Student API** | `GET /api/v1/students/:id` | Returns `rollNumber` |
| **Add Student Frontend** | Form state & payload | **Fixed (added input, validation & payload)** |
| **Edit Student Frontend** | `editStudentData.rollNumber` | Supported and preserved |
| **View Details Frontend** | `selectedStudentToView.rollNumber` | Supported (`rollNumber || '—'`) |

---

## 3. Bug Reproduction & Trace

### View Details Trace:
```
[User clicks View Details]
       ↓
[setSelectedStudentToView(student)]
       ↓
[getStudent(id) → GET /api/v1/students/:id]
       ↓
[Response: { id, firstName, lastName, admissionNumber, rollNumber: "001", ... }]
       ↓
[Render: <p className="text-slate-950 font-semibold">{selectedStudentToView.rollNumber || '—'}</p>]
```

### Add Student Trace (Before Fix):
```
[User opens Add Student]
       ↓
[formData initialized by getInitialStudentFormData()] -> rollNumber missing!
       ↓
[Academic Information Grid] -> No input field for Roll Number!
       ↓
[User clicks Admit Student]
       ↓
[Payload built in handleAddStudent] -> payload.rollNumber was omitted!
       ↓
[POST /api/v1/students] -> student created with rollNumber = null.
       ↓
[View Details opened] -> Roll Number displayed as '—'.
```

### Add Student Trace (After Fix):
```
[User opens Add Student]
       ↓
[formData initialized with rollNumber: '']
       ↓
[User enters Roll Number: "001"]
       ↓
[Client validates uniqueness within assigned class]
       ↓
[Payload: { admissionNumber, firstName, rollNumber: "001", classId, ... }]
       ↓
[POST /api/v1/students] -> PostgreSQL persists roll_number = "001".
       ↓
[View Details opened] -> Roll Number displays "001".
```

---

## 4. Exact Root Cause & Failing Layer

- **Failing Layer:** Frontend UI & Form Payload in `frontend/src/pages/Admin/StudentManagement.jsx`.
- **Defect:** 
  1. `getInitialStudentFormData()` lacked `rollNumber: ''`.
  2. The Add Student JSX in the "Academic Information" block did not render an input for `rollNumber`.
  3. `handleAddStudent` omitted `rollNumber` from the `payload` passed to `createStudent(payload)`.

---

## 5. Payloads Before vs After

### Before Fix (POST `/api/v1/students`):
```json
{
  "admissionNumber": "ADM-2026-001",
  "firstName": "Aarav",
  "lastName": "Sharma",
  "dob": "2012-05-15",
  "gender": "Male",
  "bloodGroup": "O+",
  "aadhaarNumber": "123456789012",
  "photoUrl": null,
  "classId": "cls-uuid-1",
  "sectionId": "sec-uuid-1",
  "status": "Active",
  "customData": { ... }
}
```

### After Fix (POST `/api/v1/students`):
```json
{
  "admissionNumber": "ADM-2026-001",
  "firstName": "Aarav",
  "lastName": "Sharma",
  "dob": "2012-05-15",
  "gender": "Male",
  "bloodGroup": "O+",
  "aadhaarNumber": "123456789012",
  "photoUrl": null,
  "rollNumber": "001",
  "classId": "cls-uuid-1",
  "sectionId": "sec-uuid-1",
  "status": "Active",
  "customData": { ... }
}
```

---

## 6. Code Changes

### File: `frontend/src/pages/Admin/StudentManagement.jsx`
1. **Initial State:** Added `rollNumber: ''` to `getInitialStudentFormData()`.
2. **Duplicate Validation:** Added class-scoped duplicate check in `handleAddStudent`:
   ```javascript
   let rollNumberError = null;
   const [cId, sId] = (formData.classId || '').split(':');
   if (formData.rollNumber?.trim() && cId) {
     const isRollDuplicate = students.some(
       s => s.classId === cId &&
            s.rollNumber?.toLowerCase() === formData.rollNumber.trim().toLowerCase()
     );
     if (isRollDuplicate) {
       rollNumberError = "Roll Number already exists in this class";
     }
   }
   ```
3. **Payload Construction:** Added `rollNumber: formData.rollNumber ? formData.rollNumber.trim() : null` to `createStudent` payload.
4. **Form Input:** Rendered `Roll Number` input in "Academic Information" section.

### File: `frontend/src/pages/Admin/__tests__/StudentManagement.test.jsx`
- Added comprehensive unit tests for `rollNumber`:
  - Initialization in `getInitialStudentFormData()`.
  - Presence in `createStudent` payload when provided.
  - Safe conversion to `null` when omitted.
  - View Details display and fallback.
  - Class-scoped duplicate validation.
  - Preservation during edit operations.

---

## 7. Data Preservation & Validation

- **Extended Fields:** `customData` payload merge behavior is completely unaffected; all 15+ extended custom fields continue to persist losslessly.
- **Leading Zeros & Formats:** String representation (`001`, `10A`, `23`) is preserved without numeric coercion.
- **Optionality:** `rollNumber` is optional during student creation; empty input cleanly yields `null` without validation errors.

---

## 8. Test & Build Results

- **Frontend Tests:** `npx vitest run src/pages/Admin/__tests__/StudentManagement.test.jsx` → **27 / 27 tests passed**
- **Backend Tests:** `npx vitest run tests/unit/students/ tests/integration/students/` → **70 / 70 tests passed**
- **Production Build:** `npm run build` → **Built successfully in 35.56s with 0 errors**.

---

## 9. Final Status

**RESOLVED — AUTOMATED VERIFICATION PASSED; MANUAL BROWSER VERIFICATION PENDING**
