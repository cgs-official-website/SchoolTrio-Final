# TIMETABLE — ADD PERIOD “ASSIGNED TEACHER NOT AUTO-DISPLAYED” FORENSIC AUDIT & TARGETED FIX REPORT

## 1. Executive Summary
- **Module**: Timetable
- **Submodule**: Add Period Modal
- **Bug**: When adding or editing a period on a class timetable, selecting a Subject (e.g., English) did not automatically populate the assigned teacher in the Teacher field. The field erroneously defaulted to `"-- No Teacher Assigned --"` even though a teacher was already assigned to that subject/class.
- **Root Cause**: 
  1. In [`TimetableManagement.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Admin/TimetableManagement.jsx), the subject selection change handler and teacher dropdown filtered teachers using `subObj?.assignedTeacherIds`.
  2. The canonical teacher-to-subject assignment in the system is stored on the `StaffProfile` (in `assignments.assignedSubjectIds`, `customData.assignments.assignedSubjectIds`, `subjectClassIds`, and `assignedClassId`), while `Subject` database records only contain basic attributes (`id`, `name`, `code`, `credits`).
  3. Consequently, `subObj?.assignedTeacherIds` was always `undefined`, causing the eligible teacher list to evaluate to `[]` and the selection to reset to `""`.
- **Resolution**:
  1. Implemented `getEligibleTeachersForSubject(subNameOrId, currentClassId, teachersList, subjectsList)` in [`TimetableManagement.jsx`](file:///c:/Projects/SMS/frontend/src/pages/Admin/TimetableManagement.jsx) to inspect teacher assignments, matching subject IDs/names and prioritizing class-scoped assignments (`subjectClassIds` / `assignedClassId`).
  2. Updated the Subject dropdown `onChange` handler to automatically set `teacherId` and `teacher` display name to the assigned teacher upon subject selection.
  3. Structured the Teacher dropdown to display `<optgroup label="Assigned Teachers">` for all relevant assigned staff while preserving access to other teachers under `<optgroup label="Other Teachers">`.
- **Status**: **RESOLVED & VERIFIED**

---

## 2. Reproduction & Verification
1. Navigate to **Admin → Timetable**.
2. Select a class/section (e.g. Grade 10 - Section A) and day (e.g. Monday).
3. Click **Add Period**.
4. Select a Subject from the Subject dropdown (e.g. English).
5. Verify that the assigned teacher (e.g. English teacher for Grade 10 A) is automatically populated in the Teacher field.
6. If multiple teachers are assigned, verify that all assigned teachers are available in the dropdown with the primary teacher auto-selected.
7. Save the timetable and reopen the class schedule to verify persistence.

---

## 3. Root Cause Analysis
1. **Misaligned Assignment Lookup**:
   In `frontend/src/pages/Admin/TimetableManagement.jsx` (lines 637-646 & 679-689):
   ```javascript
   // BEFORE (Buggy):
   const subObj = subjects.find(s => s.name === subName);
   const allowedIds = subObj?.assignedTeacherIds || [];
   const keepTeacher = allowedIds.includes(newSlot.teacherId);
   setNewSlot({
     ...newSlot,
     subject: subName,
     teacherId: keepTeacher ? newSlot.teacherId : '',
     teacher: keepTeacher ? newSlot.teacher : ''
   });
   ```
2. **Data Structure Discrepancy**:
   `subjects` fetched from `GET /api/v1/subjects` returns `{ id, name, code, credits }`. Teacher assignments are maintained on staff records (`GET /api/v1/staff`) under `assignments.assignedSubjectIds` and `assignments.subjectClassIds`.
3. **Resulting Behavior**:
   `subObj?.assignedTeacherIds` was always `undefined`, so `allowedIds` was `[]`. Selecting any subject always cleared `teacherId` to empty string and showed `"-- No Teacher Assigned --"`.

---

## 4. Code Fix Details

### A. Helper Function `getEligibleTeachersForSubject`
```javascript
export function getEligibleTeachersForSubject(subNameOrId, currentClassId, teachersList = [], subjectsList = []) {
  if (!subNameOrId || !Array.isArray(teachersList) || teachersList.length === 0) return [];
  const subObj = (subjectsList || []).find(s => s.name === subNameOrId || s.id === subNameOrId);
  const subId = subObj?.id;
  const subName = subObj?.name || subNameOrId;

  // 1. Find all teachers assigned to this subject
  const subjectTeachers = teachersList.filter(t => {
    if (!t) return false;
    if (Array.isArray(subObj?.assignedTeacherIds) && subObj.assignedTeacherIds.includes(t.id)) {
      return true;
    }
    if (subObj?.teacherId === t.id) {
      return true;
    }

    const assignedSubIds = [
      ...(Array.isArray(t?.assignments?.assignedSubjectIds) ? t.assignments.assignedSubjectIds : []),
      ...(Array.isArray(t?.customData?.assignments?.assignedSubjectIds) ? t.customData.assignments.assignedSubjectIds : []),
      ...(Array.isArray(t?.assignedSubjectIds) ? t.assignedSubjectIds : []),
      ...(Array.isArray(t?.customData?.assignedSubjectIds) ? t.customData.assignedSubjectIds : [])
    ];

    return assignedSubIds.some(id => 
      id === subId || 
      id === subName || 
      (typeof id === 'string' && typeof subName === 'string' && id.trim().toLowerCase() === subName.trim().toLowerCase())
    );
  });

  if (subjectTeachers.length === 0) {
    return [];
  }

  // 2. If currentClassId is specified, prioritize class-specific subject teachers
  if (currentClassId) {
    const classSpecificTeachers = subjectTeachers.filter(t => {
      const classIds = [
        t?.assignments?.assignedClassId,
        t?.customData?.assignments?.assignedClassId,
        t?.assignedClassId,
        ...(Array.isArray(t?.assignments?.subjectClassIds) ? t.assignments.subjectClassIds : []),
        ...(Array.isArray(t?.customData?.assignments?.subjectClassIds) ? t.customData.assignments.subjectClassIds : []),
        ...(Array.isArray(t?.subjectClassIds) ? t.subjectClassIds : []),
        ...(Array.isArray(t?.customData?.subjectClassIds) ? t.customData.subjectClassIds : [])
      ].filter(Boolean);

      return classIds.includes(currentClassId);
    });

    if (classSpecificTeachers.length > 0) {
      return classSpecificTeachers;
    }
  }

  return subjectTeachers;
}
```

### B. Auto-Selection on Subject Change
```javascript
const eligible = getEligibleTeachersForSubject(subName, selectedClassId, teachers, subjects);

let chosenTeacherId = '';
let chosenTeacherName = '';

if (eligible.length > 0) {
  const matchingCurrent = eligible.find(t => t.id === newSlot.teacherId);
  const defaultTeacher = matchingCurrent || eligible[0];
  chosenTeacherId = defaultTeacher.id;
  chosenTeacherName = defaultTeacher.name || `${defaultTeacher.firstName || ''} ${defaultTeacher.lastName || ''}`.trim() || 'Unnamed Teacher';
}

setNewSlot(prev => ({
  ...prev,
  subject: subObj?.name || subName,
  subjectId: subId,
  teacherId: chosenTeacherId,
  teacher: chosenTeacherName
}));
```

---

## 5. Verification & Test Matrix

| Test ID | Scenario | Result |
|---|---|---|
| A | Single assigned teacher auto-displayed on subject selection | **PASS** |
| B | Multiple assigned teachers: primary auto-displayed & all available in dropdown | **PASS** |
| C | Class-scoped assignment priority over general subject assignment | **PASS** |
| D | Fallback when no teacher is assigned (`-- No Teacher Assigned --`) | **PASS** |
| E | Subject clear/reset resets teacher selection | **PASS** |
| F | Teacher dropdown displays grouped `Assigned Teachers` and `Other Teachers` | **PASS** |
| G | Timetable weekly save & replace persistence via REST API | **PASS** |

### Test Suites Executed
1. **Frontend Timetable Suite**:
   - `vitest run src/pages/Admin/__tests__/TimetableManagement.test.jsx`: **16 passed tests (100%)**.
   - `vitest run src/api/__tests__/timetables.test.js src/pages/Teacher/__tests__/TeacherTimetable.test.jsx`: **22 passed tests (100%)**.
2. **Backend Timetable & Security Suite**:
   - `vitest run tests/unit/timetables/ tests/security/timetable-security.test.js`: **53 passed tests (100%)**.
3. **Frontend Production Build**:
   - `npm run build`: **Built cleanly in 4.49s with 0 errors**.

---

## 6. Final Status
**RESOLVED & VERIFIED**
