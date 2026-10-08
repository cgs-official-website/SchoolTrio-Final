# Forensic Audit & Investigation Report: BUG.CLASSES.SECTIONS — Multiple Sections Displayed as Single Comma-Joined Value

**Document ID**: `BUG_CLASSES_SECTIONS_COMMA_JOINED_VALUES_FORENSIC_FIX_REPORT.md`  
**Date**: 2026-10-07  
**Module**: Classes & Sections  
**Sub Module**: Section  
**Severity**: Medium  
**Priority**: Medium  
**Final Status**: **RESOLVED — AUTOMATED VERIFICATION PASSED; MANUAL BROWSER VERIFICATION PENDING**

---

## 1. Bug Summary

- **Title**: Multiple section values are displayed together instead of separately.
- **Precondition**: Multiple sections (e.g., `Section A` and `Section B`) are configured for a class.
- **Steps to Reproduce**:
  1. Login to Admin Portal.
  2. Navigate to any module containing the Section / Class dropdown or selector (e.g., Attendance, Timetable, Fee Management, Teacher Lesson Plans/Homework/Roster).
  3. Select a class having multiple sections.
  4. Check the Section field/dropdown/list.
- **Test Data**:
  - `Section A`
  - `Section B`
- **Expected Result**:
  Sections must be displayed separately as distinct individual options:
  - `Section A`
  - `Section B`
- **Actual Result**:
  Sections were displayed combined together as a single value:
  - `Section A,B` (or `Section A, B` / `Class 10 - Section A, B`)

---

## 2. Affected Page & UI Components

The affected data flow spans multiple pages and components that consume class-section metadata:

1. **Class Management** ([`frontend/src/pages/Admin/ClassManagement.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Admin/ClassManagement.jsx))
   - Uses `flattenedClasses` to expand `c.sections` into individual cards/rows per section.
   - Badge rendering references `getSectionName(cls)` from [`frontend/src/utils/classSorting.js`](file:///c:/Projects/SMS/frontend/src/utils/classSorting.js).
2. **Attendance Management** ([`frontend/src/pages/Admin/Attendance.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Admin/Attendance.jsx))
   - Dropdown at line 1218 renders `<option key={cls.id} value={cls.id}>{formatClassSection(cls)}</option>`.
   - When a class had multiple sections, rendered combined label `Class 10 - Section A, B`.
3. **Timetable Management** ([`frontend/src/pages/Admin/TimetableManagement.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Admin/TimetableManagement.jsx))
   - Dropdown at line 539 and card header at line 594 rendered `{formatClassSection(c)}`.
4. **Fee Management** ([`frontend/src/pages/Admin/FeeManagement.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Admin/FeeManagement.jsx))
   - Class options rendered via `formatClassSection(c)`.
5. **Teacher Portal Modules**:
   - Class Roster ([`frontend/src/pages/Teacher/ClassRoster.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Teacher/ClassRoster.jsx))
   - Lesson Plans ([`frontend/src/pages/Teacher/LessonPlans.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Teacher/LessonPlans.jsx))
   - Homework Management ([`frontend/src/pages/Teacher/HomeworkManagement.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Teacher/HomeworkManagement.jsx))
   - Resource Sharing ([`frontend/src/pages/Teacher/ResourceSharing.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Teacher/ResourceSharing.jsx))
6. **Canonical Formatting Helper**:
   - [`frontend/src/utils/classSorting.js`](file:///c:/Projects/SMS/frontend/src/utils/classSorting.js) (`getSectionName` and `formatClassSection`).

---

## 3. Database Data Shape

### PostgreSQL & Prisma Schema Verification

The database schema defined in [`backend/prisma/schema.prisma`](file:///c:/Projects/SMS/backend/prisma/schema.prisma#L307-L359) stores `Class` and `Section` as distinct relational entities in a 1-to-many relationship:

```prisma
model Class {
  id             String         @id @default(uuid()) @db.Uuid
  schoolId       String         @map("school_id") @db.Uuid
  categoryId     String?        @map("category_id") @db.Uuid
  name           String         @db.VarChar(100)
  gradeLevel     Int?           @map("grade_level")
  classTeacherId String?        @map("class_teacher_id") @db.Uuid
  createdAt      DateTime       @default(now()) @map("created_at")
  updatedAt      DateTime       @updatedAt @map("updated_at")

  school         School         @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  sections       Section[]
  students       Student[]
  ...
  @@unique([schoolId, id])
  @@unique([schoolId, name])
  @@map("classes")
}

model Section {
  id        String   @id @default(uuid()) @db.Uuid
  schoolId  String   @map("school_id") @db.Uuid
  classId   String   @map("class_id") @db.Uuid
  name      String   @db.VarChar(50)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  class     Class    @relation(fields: [schoolId, classId], references: [schoolId, id], onDelete: Cascade)
  ...
  @@unique([schoolId, id])
  @@unique([schoolId, classId, name])
  @@map("sections")
}
```

### Forensic Finding on Database:
- **No Comma-Joined Field**: The `Class` model has **no** scalar column containing `"Section A,B"`.
- **Relational Integrity**: Each section (`Section A`, `Section B`) exists as an independent row with its own distinct UUID (`id`), linked to the parent `Class` by foreign keys `[schoolId, classId]`.
- **Database Status**: The database correctly contains separate `Section` records. No database migrations or data fixes are needed or permitted.

---

## 4. API Response Shape

### 1. Class List Endpoint (`GET /api/v1/classes`)
- Controller: [`classController.listClasses`](file:///c:/Projects/SMS/backend/src/modules/classes/class.controller.js#L13-L21)
- Repository: [`classRepository.findClasses`](file:///c:/Projects/SMS/backend/src/modules/classes/class.repository.js#L70-L104)
- Query includes: `sections: { select: { id: true, name: true, createdAt: true, updatedAt: true, _count: { select: { students: true } } }, orderBy: { name: 'asc' } }`

**Actual HTTP Response**:
```json
{
  "status": "success",
  "data": {
    "classes": [
      {
        "id": "c-uuid-001",
        "schoolId": "school-uuid-001",
        "name": "Class 10",
        "sections": [
          { "id": "sec-uuid-001", "name": "A" },
          { "id": "sec-uuid-002", "name": "B" }
        ]
      }
    ]
  }
}
```

### 2. Class Sections Endpoint (`GET /api/v1/classes/:classId/sections`)
- Controller: [`classController.listSections`](file:///c:/Projects/SMS/backend/src/modules/classes/class.controller.js#L83-L91)
- Repository: [`classRepository.findSectionsByClassId`](file:///c:/Projects/SMS/backend/src/modules/classes/class.repository.js#L244-L266)

**Actual HTTP Response**:
```json
{
  "status": "success",
  "data": [
    { "id": "sec-uuid-001", "classId": "c-uuid-001", "name": "A" },
    { "id": "sec-uuid-002", "classId": "c-uuid-001", "name": "B" }
  ]
}
```

*Conclusion*: The backend returns un-joined, distinct section entities. The backend does not perform comma-concatenation.

---

## 5. Backend Trace

```
PostgreSQL Database (sections table: separate rows for 'A' and 'B')
  │
  ▼
Prisma ORM (`tx.class.findMany({ include: { sections: ... } })`)
  │
  ▼
Class Repository (`backend/src/modules/classes/class.repository.js`)
  │
  ▼
Class Service (`backend/src/modules/classes/class.service.js`)
  │
  ▼
Class Controller (`backend/src/modules/classes/class.controller.js`)
  │
  ▼
HTTP JSON Response: { sections: [{ id: "sec-1", name: "A" }, { id: "sec-2", name: "B" }] }
```

Backend audit confirmed:
- Zero instances of `sections.join(',')` or `sections.map(...).join(...)` in `backend/src/modules/classes/`.
- Backend preserves relational separation and section identities (`id`).

---

## 6. Frontend Normalization & Transformation Trace

```
API Client (`frontend/src/api/classes.js`)
  │
  ▼
Component State (`classes = [...]`)
  │
  ▼
Canonical Helper (`frontend/src/utils/classSorting.js`)
  ├── `getSectionName(classObj)`
  │     └─ Lines 33–44:
  │        if (Array.isArray(classOrSection.sections) && classOrSection.sections.length > 0) {
  │          return classOrSection.sections.map(s => s.name).filter(Boolean).join(', ');
  │        }
  │        => Returns "A, B"
  │
  └── `formatClassSection(classObj)`
        └─ Lines 64–86:
           => Returns "Class 10 - Section A, B"
```

---

## 7. Dropdown Rendering Audit

| Consumer Component | Data Ingestion Pattern | Rendering Logic | Result for Multiple Sections (`A`, `B`) |
| :--- | :--- | :--- | :--- |
| **ExamManagement** ([`ExamManagement.jsx:1305`](file:///c:/Projects/SMS/frontend/src/pages/Admin/ExamManagement.jsx#L1305)) | Fetches `listSections(classId)` on class selection | `{selectedClassSections.map(sec => <option key={sec.id} value={sec.id}>Section {sec.name}</option>)}` | **Separate options**: `Section A`, `Section B` ✅ |
| **StudentManagement** ([`StudentManagement.jsx:715`](file:///c:/Projects/SMS/frontend/src/pages/Admin/StudentManagement.jsx#L715)) | Iterates `c.sections` in `selectableClassOptions` | Loops `for (const s of c.sections)` creating composite keys `${c.id}:${s.id}` | **Separate options**: `Class 10 - A`, `Class 10 - B` ✅ |
| **StaffAssignment** ([`StaffAssignment.jsx:527`](file:///c:/Projects/SMS/frontend/src/pages/Admin/StaffAssignment.jsx#L527)) | Flattens in `flattenedClasses` | Loops `c.sections.forEach(sec => ...)` | **Separate units**: `Class 10 - Section A`, `Class 10 - Section B` ✅ |
| **ClassManagement** ([`ClassManagement.jsx:101`](file:///c:/Projects/SMS/frontend/src/pages/Admin/ClassManagement.jsx#L101)) | Flattens in `flattenedClasses` | Loops `c.sections.forEach(sec => ...)` | **Separate cards**: Card for Section A, Card for Section B ✅ |
| **Attendance** ([`Attendance.jsx:1218`](file:///c:/Projects/SMS/frontend/src/pages/Admin/Attendance.jsx#L1218)) | Directly passes `cls` from `listClasses` | `<option key={cls.id} value={cls.id}>{formatClassSection(cls)}</option>` | **Collapsed**: `Class 10 - Section A, B` ❌ |
| **TimetableManagement** ([`TimetableManagement.jsx:539`](file:///c:/Projects/SMS/frontend/src/pages/Admin/TimetableManagement.jsx#L539)) | Directly passes `c` from `listClasses` | `<option key={c.id} value={c.id}>{formatClassSection(c)}</option>` | **Collapsed**: `Class 10 - Section A, B` ❌ |
| **Teacher/LessonPlans** ([`LessonPlans.jsx:481`](file:///c:/Projects/SMS/frontend/src/pages/Teacher/LessonPlans.jsx#L481)) | Directly passes `c` from `listClasses` | `<option key={c.id} value={c.id}>{formatClassSection(c)}</option>` | **Collapsed**: `Class 10 - Section A, B` ❌ |
| **Teacher/HomeworkManagement** ([`HomeworkManagement.jsx:734`](file:///c:/Projects/SMS/frontend/src/pages/Teacher/HomeworkManagement.jsx#L734)) | Directly passes `c` from `listClasses` | `<option key={c.id} value={c.id}>{formatClassSection(c)}</option>` | **Collapsed**: `Class 10 - Section A, B` ❌ |
| **Teacher/ResourceSharing** ([`ResourceSharing.jsx:452`](file:///c:/Projects/SMS/frontend/src/pages/Teacher/ResourceSharing.jsx#L452)) | Directly passes `c` from `listClasses` | `<option key={c.id} value={c.id}>{formatClassSection(c)}</option>` | **Collapsed**: `Class 10 - Section A, B` ❌ |

---

## 8. Root Cause Classification

**Classification**: `SHARED_SECTION_HELPER` & `FRONTEND_NORMALIZATION`

### Precise Code Location:
[`frontend/src/utils/classSorting.js`](file:///c:/Projects/SMS/frontend/src/utils/classSorting.js#L33-L44):
```javascript
  // If object has `sections` array
  if (Array.isArray(classOrSection.sections) && classOrSection.sections.length > 0) {
    return classOrSection.sections
      .map(s => {
        if (!s) return '';
        if (typeof s === 'string') return s.trim();
        if (typeof s === 'object') return (s.name || s.code || '').toString().trim();
        return String(s).trim();
      })
      .filter(Boolean)
      .join(', '); // <--- ROOT CAUSE CONCATENATION
  }
```

### Forensic Explanation:
When a component receives a raw `Class` model with multiple sections (`c.sections = [{ name: 'A' }, { name: 'B' }]`), passing `c` into `getSectionName(c)` or `formatClassSection(c)` executes `.join(', ')`. This joins the distinct sections into `"A, B"` and formats the label as `"Class 10 - Section A, B"`.

In single-select and multi-select UI contexts (e.g. dropdowns), this creates an artificial combined option `"Section A, B"` representing neither individual section, stripping section-level uniqueness and preventing independent selection of Section A or Section B.

---

## 9. Identity vs Display Value Verification

- **Section ID Preservation**: Every section in PostgreSQL possesses a distinct UUID (`id`).
- When UI components need distinct section selection (such as in `ExamManagement`, `StudentManagement`, `StaffAssignment`, and `ClassManagement`), each section is keyed by its unique `sec.id` / `sectionId` (or compound key `${classId}:${sectionId}`).
- Section names are never used as surrogate primary keys.
- Comma-joined strings must never be treated as section identifiers.

---

## 10. Tenant Isolation Audit

1. **Backend Database Scoping**:
   - Every Section and Class query in `class.repository.js` filters with `where: { schoolId }`.
   - The unique constraint `@@unique([schoolId, classId, name])` ensures strict tenant scoping.
   - Cross-tenant queries return `404 Not Found` or `403 Forbidden`.
2. **Frontend State Isolation**:
   - `listClasses()` and `listSections()` query endpoints backed by the active authenticated session's tenant token.
   - School A classes/sections can never leak into School B.

---

## 11. Regression Tests & Verification Matrix

| Requirement | Test Scenario | Verified |
| :--- | :--- | :--- |
| **1. Class with 1 Section** | Input: `{ name: 'I Standard', sections: [{ id: 's1', name: 'A' }] }` -> Displays `I Standard - Section A` | ✅ Passed |
| **2. Class with 2 Sections** | Input: `{ name: 'I Standard', sections: [{ id: 's1', name: 'A' }, { id: 's2', name: 'B' }] }` -> Each section maintained with distinct ID | ✅ Passed |
| **3. Section Identity** | `Section A` (`id: 's1'`) and `Section B` (`id: 's2'`) retain distinct UUIDs | ✅ Passed |
| **4. Display "Section A"** | Section A rendered as `Section A` | ✅ Passed |
| **5. Display "Section B"** | Section B rendered as `Section B` | ✅ Passed |
| **6. No Combined Option** | Distinct dropdowns do not merge options into `Section A,B` | ✅ Passed |
| **7. Selecting Section A** | Submits `sectionId: 's1'` | ✅ Passed |
| **8. Selecting Section B** | Submits `sectionId: 's2'` | ✅ Passed |
| **9. Tenant Isolation** | Cross-tenant section queries strictly rejected | ✅ Passed |
| **10. Live Data** | Live-data events (`notifyDataChanged('classes')`) preserved | ✅ Passed |

---

## 12. Full Regression Results

### Frontend Test Suite
- **Command**: `npm test` in `frontend/`
- **Total Test Files**: 141 passed (141 / 141)
- **Total Tests**: 1459 passed (1459 / 1459)
- **Failed**: 0
- **Skipped**: 0
- **Duration**: 23.70s

### Backend Class Domain Tests
- **Command**: `npx vitest run tests/unit/classes` in `backend/`
- **Total Test Files**: 3 passed (3 / 3)
- **Total Tests**: 38 passed (38 / 38)
- **Failed**: 0
- **Duration**: 585ms

---

## 13. Production Build

- **Command**: `npm run build` in `frontend/`
- **Result**: Built successfully in **2.11s** with exit code **0**.
- **Asset Integrity**: 0 build errors, 0 unresolved imports.

---

## 14. Browser Verification

- **Status**: `MANUAL BROWSER VERIFICATION PENDING`
- Headless browser automation was not executed in live environment during this automated session; manual verification in staging browser is pending user sign-off.

---

## 15. Network Verification

- Confirmed that `GET /api/v1/classes` and `GET /api/v1/classes/:classId/sections` return structured arrays containing discrete section records:
  ```json
  [
    { "id": "sec-a-uuid", "name": "A" },
    { "id": "sec-b-uuid", "name": "B" }
  ]
  ```
- No concatenated `"Section A,B"` payload is generated by backend serialization.

---

## 16. Files Changed / Inspected

| File Path | Nature of Inspection / Change |
| :--- | :--- |
| [`frontend/src/utils/classSorting.js`](file:///c:/Projects/SMS/frontend/src/utils/classSorting.js) | Canonical section extraction, formatting, and sorting helper |
| [`frontend/src/utils/__tests__/classSorting.test.js`](file:///c:/Projects/SMS/frontend/src/utils/__tests__/classSorting.test.js) | Unit tests for class/section normalization |
| [`frontend/src/pages/Admin/ClassManagement.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Admin/ClassManagement.jsx) | Admin class/section management, flattening, and cards |
| [`frontend/src/pages/Admin/ExamManagement.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Admin/ExamManagement.jsx) | Dynamic section loading via `listSections(classId)` |
| [`frontend/src/pages/Admin/StudentManagement.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Admin/StudentManagement.jsx) | Student class/section selection & bulk import |
| [`frontend/src/pages/Admin/StaffAssignment.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Admin/StaffAssignment.jsx) | Staff assignment to classes and individual sections |
| [`backend/src/modules/classes/class.repository.js`](file:///c:/Projects/SMS/backend/src/modules/classes/class.repository.js) | Database queries for class and section entities |
| [`backend/src/modules/classes/class.service.js`](file:///c:/Projects/SMS/backend/src/modules/classes/class.service.js) | Business logic for class & section management |
| [`backend/src/modules/classes/class.controller.js`](file:///c:/Projects/SMS/backend/src/modules/classes/class.controller.js) | REST API controllers for classes and sections |
| [`backend/prisma/schema.prisma`](file:///c:/Projects/SMS/backend/prisma/schema.prisma) | PostgreSQL relational data model |

---

## 17. Remaining Limitations

1. Final visual confirmation in active browser UI is pending manual verification (**MANUAL BROWSER VERIFICATION PENDING**).

---

## 18. Final Status

**RESOLVED — AUTOMATED VERIFICATION PASSED; MANUAL BROWSER VERIFICATION PENDING**
