# End-to-End Testing Guide: School Management System

This document provides a comprehensive step-by-step process for testing all modules of the School Management System. Follow these steps sequentially to simulate a real-world usage lifecycle.

> [!NOTE]
> Ensure your local development server is running (`npm run dev`) and Firebase is properly configured before beginning these tests.

---

## Phase 1: Authentication & Onboarding

### 1. Registration Flow
- [ ] **School Registration:** Navigate to `/register/school`. Fill in the school details and submit. Verify that the school is created and you are redirected to a pending/dashboard page.
- [ ] **Teacher Registration:** Navigate to `/register/teacher`. Fill in the details. Verify successful account creation.
- [ ] **Parent Registration:** Navigate to `/register/parent`. Fill in the details and link to a mock student ID. Verify successful creation.

### 2. Login Flow
- [ ] Navigate to `/login`.
- [ ] Log in using the **Super Admin** credentials. Verify redirection to the Super Admin Dashboard.
- [ ] Log in using an **Admin** credentials. Verify redirection to the Admin Dashboard.
- [ ] Log in using **Teacher** credentials. Verify redirection to the Teacher Dashboard.
- [ ] Log in using **Parent** credentials. Verify redirection to the Parent Dashboard.

### 3. Forgot Password
- [ ] Navigate to `/forgot-password`.
- [ ] Enter a registered email address and submit. Verify that a password reset email is sent (check Firebase authentication logs or your email inbox).

---

## Phase 2: Super Admin Operations

*Log in as a Super Admin to execute this phase.*

### 1. Tenant & Subscription Management
- [ ] **Tenant Management:** Navigate to the Tenants list. Click "Edit" on a pending tenant. Verify you can change their status to "Approved".
- [ ] **Plan Management:** Navigate to Subscription Plans. Click "Create New Plan". Fill in pricing and features. Click "Save Plan" and verify it appears in the grid.
- [ ] **Delete Plan:** Click the Trash icon on a test plan. Verify the non-blocking `ConfirmModal` appears. Click "Delete" and verify the plan is removed.

### 2. System Settings
- [ ] **Feature Flags:** Toggle global feature flags on/off. Verify the state saves successfully.
- [ ] **Audit Logs:** View the audit logs and verify that recent actions (like approving a tenant or creating a plan) are recorded.

---

## Phase 3: Admin Operations (School Management)

*Log in as a School Admin to execute this phase.*

### 1. Core Academic Setup
- [ ] **Class Management:** Navigate to Classes. Add a new Class (e.g., "Grade 10 - Section C"). Verify it appears in the list.
- [ ] **Timetable Management:** Select a class from the dropdown. Click the "+" icon on a day (e.g., Monday). Add a subject and teacher, and save. Verify the slot appears on the grid.
- [ ] **Subject & Staff Assignment:** Assign a teacher to a specific subject and class. 

### 2. Student & Teacher Management
- [ ] **Add Student:** Navigate to Student Management. Add a new student record. Verify it displays in the table.
- [ ] **HR & Payroll:** Navigate to HR/Payroll. Edit a teacher's salary. Click "Save" and verify the update. Click "Delete" and verify the `ConfirmModal` works.

### 3. Daily Operations
- [ ] **Attendance Management:** Navigate to Attendance. Mark a student as "Absent". Verify the table updates.
- [ ] **Noticeboard:** Navigate to Noticeboard. Click "Create Notice". Fill in details and target audience (e.g., "All"). Publish and verify it appears on the board.
- [ ] **Complaint Redressal:** View active complaints. Change the status of a complaint from "Open" to "Resolved". Verify the status indicator updates.

### 4. Ancillary Modules
- [ ] **Library Management:** Add a new book. Issue the book to a student. Switch to the "Issued Books" tab and verify the record exists.
- [ ] **Inventory Management:** Add a new item (e.g., "Laptops"). Update the quantity. 
- [ ] **Hostel & Transport:** Assign a student to a hostel room and transport route. Check for capacity updates.

---

## Phase 4: Teacher Operations

*Log in as a Teacher to execute this phase.*

### 1. Academic Duties
- [ ] **Class Roster:** View assigned classes and ensure the student lists match the Admin's setup.
- [ ] **Attendance:** Take daily attendance for a specific class. Submit and verify the success toast.
- [ ] **Grades/Marks:** Enter marks for a recent exam. Save and verify the calculations.

### 2. Class Engagement
- [ ] **Homework Management:** Create a new homework assignment. Set a due date and attach a mock file. Verify it publishes.
- [ ] **Lesson Plans:** Create a lesson plan for the upcoming week.
- [ ] **Noticeboard:** Check the Teacher Noticeboard to verify the notice published by the Admin in Phase 3 is visible.

---

## Phase 5: Parent Operations

*Log in as a Parent to execute this phase.*

### 1. Monitoring & Updates
- [ ] **Student Overview:** View the dashboard. Verify that attendance, recent grades, and upcoming fees match the data entered by the Admin/Teacher.
- [ ] **Homework:** Verify the homework assignment created by the teacher in Phase 4 is visible.
- [ ] **Noticeboard:** Check the noticeboard to see school-wide announcements.

### 2. Communication
- [ ] **Chat:** Open the chat module. Send a message to the assigned class teacher. (If possible, log back in as the teacher to verify receipt).
- [ ] **PTM Scheduler:** Request a Parent-Teacher Meeting slot. Verify the request is logged as pending.

---

## Final Validation

- [ ] **Error Handling:** Intentionally input incorrect data (e.g., letters in a phone number field, invalid emails) to ensure validation errors appear.
- [ ] **Responsiveness:** Shrink your browser window to mobile size and navigate through the sidebars and tables to ensure UI scales properly.
- [ ] **State Integrity:** Ensure no UI freezing occurs during destructive actions (verified via the custom `ConfirmModal`).

> [!TIP]
> Keep the browser's developer console (F12) open during testing to monitor for any silent React warnings or Firebase permission errors.
