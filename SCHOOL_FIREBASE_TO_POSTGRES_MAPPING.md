# SCHOOL_FIREBASE_TO_POSTGRES_MAPPING.md

## 1. Executive Summary

Field-by-field and relationship mapping between Firebase Firestore documents and PostgreSQL Prisma models.

---

## 2. Institutional Core Models Field Mapping

### A. `School` (Firestore `/schools/{schoolId}` &rarr; Prisma `School`)

| Firebase Field | Target PostgreSQL Field | Transformation / Type Conversion | Nullable / Default |
| :--- | :--- | :--- | :--- |
| `doc.id` (`SchoolS019`) | `code` | Legacy school code string | Non-null |
| *Generated UUID* | `id` | `cuid()` / `uuidv4()` primary key | Non-null |
| `name` \| `schoolName` | `name` | String trimmed | Non-null |
| `contactEmail` \| `adminEmail`| `email` | Lowercase email | Nullable |
| `phone` \| `contactPhone` | `phone` | String trimmed | Nullable |
| `location` | `address` | String trimmed | Nullable |
| `status` | `status` | Map `'approved'` &rarr; `ACTIVE`, `'suspended'` &rarr; `SUSPENDED`, `'pending'` &rarr; `PENDING_APPROVAL` | Default `ACTIVE` |
| `createdAt` | `createdAt` | ISO string &rarr; `DateTime` | Default `now()` |

---

### B. `User` (Firestore `/users/{uid}` or `/schools/{schoolId}/teachers` &rarr; Prisma `User`)

| Firebase Field | Target PostgreSQL Field | Transformation / Type Conversion | Nullable / Default |
| :--- | :--- | :--- | :--- |
| `doc.id` (UID or String) | `id` | Mapped to UUID or legacy UID reference | Non-null |
| `email` | `email` | Lowercase trimmed string | Non-null |
| `name` \| `displayName` | `firstName`, `lastName` | Split name string | Non-null |
| *Password* | `passwordHash` | Argon2id hash of `12345678` for temporary password setup, or `!LOCKED_FIREBASE_AUTH_MANAGED` for JIT bridge | Non-null |
| `role` | `role` (Enum) | Map `'admin'` &rarr; `SCHOOL_ADMIN`, `'teacher'` &rarr; `TEACHER`, `'staff'` &rarr; `STAFF`, `'parent'` &rarr; `PARENT` | Default `TEACHER` |
| `schoolId` | `schoolId` | Resolved to PostgreSQL `School.id` UUID | Non-null |

---

### C. `Student` (Firestore `/schools/{schoolId}/students/{id}` &rarr; Prisma `Student`)

| Firebase Field | Target PostgreSQL Field | Transformation / Type Conversion | Nullable / Default |
| :--- | :--- | :--- | :--- |
| `doc.id` | `id` | Mapped to UUID | Non-null |
| `admissionNo` \| `rollNum` | `admissionNum` | String trimmed | Non-null |
| `name` \| `studentName` | `firstName`, `lastName` | Split name string | Non-null |
| `dob` | `dob` | String / Timestamp &rarr; `DateTime` | Nullable |
| `gender` | `gender` | Capitalized string | Nullable |
| `classId` \| `className` | `classId` | Resolved to PostgreSQL `Class.id` UUID | Non-null |
| `schoolId` | `schoolId` | Resolved to PostgreSQL `School.id` UUID | Non-null |

---

### D. `Class` (Firestore `/schools/{schoolId}/classes/{id}` &rarr; Prisma `Class`)

| Firebase Field | Target PostgreSQL Field | Transformation / Type Conversion | Nullable / Default |
| :--- | :--- | :--- | :--- |
| `doc.id` | `id` | Mapped to UUID | Non-null |
| `name` \| `className` | `name` | String trimmed (e.g. `'10-A'`) | Non-null |
| `section` | `section` | String trimmed (e.g. `'A'`) | Nullable |
| `schoolId` | `schoolId` | Resolved to PostgreSQL `School.id` UUID | Non-null |

---

### E. `Subject` (Firestore `/schools/{schoolId}/subjects/{id}` &rarr; Prisma `Subject`)

| Firebase Field | Target PostgreSQL Field | Transformation / Type Conversion | Nullable / Default |
| :--- | :--- | :--- | :--- |
| `doc.id` | `id` | Mapped to UUID | Non-null |
| `name` \| `subjectName` | `name` | String trimmed (e.g. `'Mathematics'`) | Non-null |
| `code` | `code` | Uppercase code string | Nullable |
| `schoolId` | `schoolId` | Resolved to PostgreSQL `School.id` UUID | Non-null |

---

## 3. Relationship Resolution & Multi-Tenant Enforcement

Every migrated record undergoes mandatory tenant verification:

```text
Record in Firestore Subcollection /schools/{schoolId}/...
               ↓
Resolve schoolId → PostgreSQL School.id UUID
               ↓
Set record.schoolId = PostgreSQL School.id
               ↓
Validate foreign keys (classId, parentId, teacherId, subjectId) belong to SAME schoolId
```
