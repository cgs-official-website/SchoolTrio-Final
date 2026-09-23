-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "schools" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "type" VARCHAR(50),
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "seat_limit" INTEGER,
    "teacher_limit" INTEGER,
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    "logo_url" TEXT,
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "address" TEXT,
    "api_keys_encrypted" JSONB,
    "plan_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "legacy_firestore_id" VARCHAR(128),

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "user_limit" INTEGER NOT NULL,
    "price_per_user_per_year" DECIMAL(10,2) NOT NULL,
    "cloud_storage_gb" INTEGER NOT NULL DEFAULT 5,
    "modules" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "school_id" UUID,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "password_algorithm" VARCHAR(50) NOT NULL DEFAULT 'argon2id',
    "system_role" VARCHAR(30) NOT NULL DEFAULT 'TENANT_USER',
    "token_version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "legacy_firestore_id" VARCHAR(128),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "device_info" TEXT,
    "ip_address" VARCHAR(45),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_id_map" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "collection_name" VARCHAR(100) NOT NULL,
    "firestore_id" VARCHAR(128) NOT NULL,
    "postgres_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_id_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" VARCHAR(128),
    "action_performed" VARCHAR(100) NOT NULL,
    "user_name" VARCHAR(200) NOT NULL,
    "user_role" VARCHAR(50),
    "modified_fields" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "school_role_id" UUID NOT NULL,
    "module_key" VARCHAR(100) NOT NULL,
    "can_read" BOOLEAN NOT NULL DEFAULT false,
    "can_create" BOOLEAN NOT NULL DEFAULT false,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,
    "can_delete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role_assignments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "school_role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_student_links" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "parent_profile_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "relationship" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_student_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_settings" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_roles" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "login_panel" VARCHAR(30),
    "is_system_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_categories" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "category_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "grade_level" INTEGER,
    "class_teacher_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "credits" DECIMAL(3,1),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_periods" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "section_id" UUID,
    "subject_id" UUID,
    "teacher_id" UUID,
    "day_of_week" INTEGER NOT NULL,
    "period_number" INTEGER NOT NULL,
    "start_time" VARCHAR(10) NOT NULL,
    "end_time" VARCHAR(10) NOT NULL,
    "room_number" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_calendar_events" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "end_date" VARCHAR(10),
    "type" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "audience" VARCHAR(50) NOT NULL DEFAULT 'all',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_plans" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "week_number" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'Draft',
    "topics" TEXT,
    "objectives" TEXT,
    "custom_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_resources" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID,
    "uploader_id" UUID NOT NULL,
    "file_url" TEXT,
    "file_type" VARCHAR(50),
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_id" UUID,
    "section_id" UUID,
    "transport_route_id" UUID,
    "pickup_stop_id" UUID,
    "admission_number" VARCHAR(100) NOT NULL,
    "roll_number" VARCHAR(50),
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100),
    "dob" VARCHAR(10),
    "gender" VARCHAR(20),
    "blood_group" VARCHAR(10),
    "aadhaar_number" VARCHAR(12),
    "photo_url" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'Active',
    "custom_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "legacy_firestore_id" VARCHAR(128),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_profiles" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "address" TEXT,
    "emergency_contact" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parent_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_id" VARCHAR(100),
    "name" VARCHAR(200) NOT NULL,
    "staff_type" VARCHAR(30) NOT NULL DEFAULT 'teaching',
    "designation" VARCHAR(100),
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "assigned_class_id" UUID,
    "base_salary" DECIMAL(10,2) DEFAULT 0,
    "status" VARCHAR(30) NOT NULL DEFAULT 'Active',
    "custom_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_payroll_records" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "month" VARCHAR(20) NOT NULL,
    "base_salary" DECIMAL(10,2) NOT NULL,
    "pf_calculated" DECIMAL(10,2) DEFAULT 0,
    "esi_calculated" DECIMAL(10,2) DEFAULT 0,
    "deductions" DECIMAL(10,2) DEFAULT 0,
    "net_pay" DECIMAL(10,2) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'Pending',
    "paid_at" TIMESTAMP(3),
    "custom_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_payroll_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "section_id" UUID,
    "date" VARCHAR(10) NOT NULL,
    "session" VARCHAR(20) NOT NULL DEFAULT 'STANDARD',
    "marked_by_user_id" UUID NOT NULL,
    "submitted_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "remark" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_stats" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year" VARCHAR(20) NOT NULL,
    "total_days" INTEGER NOT NULL DEFAULT 0,
    "present_days" INTEGER NOT NULL DEFAULT 0,
    "absent_days" INTEGER NOT NULL DEFAULT 0,
    "late_days" INTEGER NOT NULL DEFAULT 0,
    "percentage" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absentee_flags" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "month_str" VARCHAR(7) NOT NULL,
    "absent_count" INTEGER NOT NULL,
    "flagged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "absentee_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examinations" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "term" VARCHAR(50) NOT NULL,
    "academic_year" VARCHAR(20) NOT NULL,
    "start_date" VARCHAR(10),
    "end_date" VARCHAR(10),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "examinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "exam_id" UUID,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "total_marks" DECIMAL(5,2) NOT NULL,
    "passing_marks" DECIMAL(5,2),
    "date" VARCHAR(10),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_grades" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "marks_obtained" DECIMAL(5,2) NOT NULL,
    "grade" VARCHAR(10),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_card_templates" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "template_type" VARCHAR(50) NOT NULL DEFAULT 'report_card',
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_card_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_cards" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "term" VARCHAR(50),
    "exam_id" UUID,
    "marks_data" JSONB NOT NULL,
    "grades" JSONB,
    "attendance_summary" JSONB,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_assignments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "due_date" VARCHAR(10) NOT NULL,
    "attachments" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_submissions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "homework_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attachments" JSONB,
    "status" VARCHAR(30) NOT NULL DEFAULT 'Submitted',
    "grade" VARCHAR(10),
    "feedback" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_collection_periods" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "due_date" VARCHAR(10) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_collection_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "due_date" VARCHAR(10) NOT NULL,
    "class_id" UUID NOT NULL,
    "collection_period_id" UUID,
    "custom_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "fee_structure_id" UUID NOT NULL,
    "collection_period_id" UUID,
    "fee_name" VARCHAR(150) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "due_date" VARCHAR(10) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'Pending',
    "paid_at" TIMESTAMP(3),
    "payment_mode" VARCHAR(50),
    "transaction_reference" VARCHAR(100),
    "receipt_number" VARCHAR(100),
    "custom_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_categories" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_books" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "category_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "author" VARCHAR(255),
    "isbn" VARCHAR(50),
    "category" VARCHAR(100),
    "total_quantity" INTEGER NOT NULL DEFAULT 1,
    "available_quantity" INTEGER NOT NULL DEFAULT 1,
    "custom_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_book_issues" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" VARCHAR(10) NOT NULL,
    "returned_at" TIMESTAMP(3),
    "status" VARCHAR(30) NOT NULL DEFAULT 'issued',
    "fine_amount" DECIMAL(8,2) DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_book_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_vehicles" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "registration_number" VARCHAR(20) NOT NULL,
    "model" VARCHAR(100),
    "capacity" INTEGER NOT NULL,
    "insurance_expiry" VARCHAR(10),
    "pollution_expiry" VARCHAR(10),
    "fitness_expiry" VARCHAR(10),
    "status" VARCHAR(30) NOT NULL DEFAULT 'Active',
    "custom_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_routes" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "vehicle_id" UUID,
    "name" VARCHAR(150) NOT NULL,
    "route_number" VARCHAR(50),
    "driver_name" VARCHAR(100),
    "driver_phone" VARCHAR(20),
    "capacity" INTEGER NOT NULL DEFAULT 30,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stops" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "stop_name" VARCHAR(150) NOT NULL,
    "pickup_time" VARCHAR(10),
    "drop_time" VARCHAR(10),
    "stop_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_categories" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "category_id" UUID,
    "product_id" VARCHAR(100),
    "name" VARCHAR(150) NOT NULL,
    "category" VARCHAR(100),
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unit" VARCHAR(50) NOT NULL DEFAULT 'pcs',
    "minimum_stock" INTEGER NOT NULL DEFAULT 5,
    "unit_price" DECIMAL(10,2),
    "status" VARCHAR(30) NOT NULL DEFAULT 'In Stock',
    "custom_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_audit_logs" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "item_name" VARCHAR(150),
    "type" VARCHAR(30) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "remarks" TEXT,
    "user_name" VARCHAR(200) NOT NULL,
    "user_role" VARCHAR(50),
    "prev_stock" INTEGER,
    "new_stock" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_rooms" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "status" VARCHAR(30) DEFAULT 'active',
    "last_message" TEXT,
    "last_message_time" TIMESTAMP(3),
    "unread_count_parent" INTEGER NOT NULL DEFAULT 0,
    "unread_count_teacher" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "chat_room_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "sender_role" VARCHAR(30) NOT NULL,
    "text" TEXT,
    "media_url" TEXT,
    "media_type" VARCHAR(30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_channels" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "class_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcast_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_posts" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "sender_name" VARCHAR(200) NOT NULL,
    "text" TEXT,
    "media_url" TEXT,
    "media_type" VARCHAR(30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "type" VARCHAR(30) NOT NULL DEFAULT 'global',
    "class_id" UUID,
    "audience" VARCHAR(50) NOT NULL DEFAULT 'all',
    "viewed_by" JSONB,
    "attachments" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID,
    "class_id" UUID,
    "type" VARCHAR(50) NOT NULL,
    "message" TEXT NOT NULL,
    "date" VARCHAR(10),
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_applications" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "applicant_id" UUID NOT NULL,
    "leave_type" VARCHAR(50) NOT NULL,
    "start_date" VARCHAR(10) NOT NULL,
    "end_date" VARCHAR(10) NOT NULL,
    "reason" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'Pending',
    "reviewed_by" UUID,
    "custom_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_approval_rules" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "min_days" INTEGER NOT NULL,
    "max_days" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_approval_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ptm_appointments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "class_id" UUID,
    "date" VARCHAR(10) NOT NULL,
    "time_slot" VARCHAR(50) NOT NULL,
    "type" VARCHAR(30) NOT NULL DEFAULT 'In-person',
    "status" VARCHAR(30) NOT NULL DEFAULT 'Scheduled',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ptm_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canteen_requests" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "item_details" JSONB NOT NULL,
    "total_amount" DECIMAL(8,2) DEFAULT 0,
    "status" VARCHAR(30) NOT NULL DEFAULT 'Pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canteen_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" VARCHAR(200),
    "description" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "submitted_by_user_id" UUID,
    "assigned_to_user_id" UUID,
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_modules" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "icon" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_form_schemas" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "module_key" VARCHAR(100) NOT NULL,
    "sections" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_form_schemas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_module_records" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "custom_module_id" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_module_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_leads" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "grade_interested" VARCHAR(50),
    "status" VARCHAR(30) NOT NULL DEFAULT 'New',
    "custom_data" JSONB,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_forms" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "fields" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_applications" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_id" UUID,
    "student_name" VARCHAR(150) NOT NULL,
    "dob" VARCHAR(10) NOT NULL,
    "gender" VARCHAR(20) NOT NULL,
    "parent_name" VARCHAR(150) NOT NULL,
    "parent_phone" VARCHAR(20) NOT NULL,
    "parent_email" VARCHAR(255),
    "address" TEXT,
    "photo_url" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'Pending',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schools_code_key" ON "schools"("code");

-- CreateIndex
CREATE UNIQUE INDEX "schools_email_key" ON "schools"("email");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_name_key" ON "subscription_plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_school_id_idx" ON "users"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_token_hash_key" ON "refresh_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_sessions_user_id_idx" ON "refresh_sessions"("user_id");

-- CreateIndex
CREATE INDEX "migration_id_map_school_id_postgres_id_idx" ON "migration_id_map"("school_id", "postgres_id");

-- CreateIndex
CREATE UNIQUE INDEX "migration_id_map_school_id_collection_name_firestore_id_key" ON "migration_id_map"("school_id", "collection_name", "firestore_id");

-- CreateIndex
CREATE INDEX "audit_logs_school_id_entity_type_idx" ON "audit_logs"("school_id", "entity_type");

-- CreateIndex
CREATE INDEX "audit_logs_school_id_timestamp_idx" ON "audit_logs"("school_id", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_school_role_id_module_key_key" ON "role_permissions"("school_role_id", "module_key");

-- CreateIndex
CREATE INDEX "user_role_assignments_school_id_user_id_idx" ON "user_role_assignments"("school_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_assignments_school_id_id_key" ON "user_role_assignments"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_assignments_user_id_school_role_id_key" ON "user_role_assignments"("user_id", "school_role_id");

-- CreateIndex
CREATE INDEX "parent_student_links_school_id_student_id_idx" ON "parent_student_links"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "parent_student_links_school_id_id_key" ON "parent_student_links"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "parent_student_links_parent_profile_id_student_id_key" ON "parent_student_links"("parent_profile_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_settings_school_id_id_key" ON "school_settings"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "school_settings_school_id_category_key" ON "school_settings"("school_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "school_roles_school_id_id_key" ON "school_roles"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "school_roles_school_id_slug_key" ON "school_roles"("school_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "class_categories_school_id_id_key" ON "class_categories"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "class_categories_school_id_name_key" ON "class_categories"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "classes_school_id_id_key" ON "classes"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "classes_school_id_name_key" ON "classes"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sections_school_id_id_key" ON "sections"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sections_school_id_class_id_name_key" ON "sections"("school_id", "class_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_school_id_id_key" ON "subjects"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_school_id_code_key" ON "subjects"("school_id", "code");

-- CreateIndex
CREATE INDEX "timetable_periods_school_id_class_id_day_of_week_idx" ON "timetable_periods"("school_id", "class_id", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_periods_school_id_id_key" ON "timetable_periods"("school_id", "id");

-- CreateIndex
CREATE INDEX "academic_calendar_events_school_id_date_idx" ON "academic_calendar_events"("school_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "academic_calendar_events_school_id_id_key" ON "academic_calendar_events"("school_id", "id");

-- CreateIndex
CREATE INDEX "lesson_plans_school_id_teacher_id_idx" ON "lesson_plans"("school_id", "teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_plans_school_id_id_key" ON "lesson_plans"("school_id", "id");

-- CreateIndex
CREATE INDEX "academic_resources_school_id_class_id_idx" ON "academic_resources"("school_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_resources_school_id_id_key" ON "academic_resources"("school_id", "id");

-- CreateIndex
CREATE INDEX "students_school_id_class_id_idx" ON "students"("school_id", "class_id");

-- CreateIndex
CREATE INDEX "students_school_id_legacy_firestore_id_idx" ON "students"("school_id", "legacy_firestore_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_school_id_id_key" ON "students"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "students_school_id_admission_number_key" ON "students"("school_id", "admission_number");

-- CreateIndex
CREATE UNIQUE INDEX "parent_profiles_user_id_key" ON "parent_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "parent_profiles_school_id_id_key" ON "parent_profiles"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_user_id_key" ON "staff_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_school_id_id_key" ON "staff_profiles"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_school_id_employee_id_key" ON "staff_profiles"("school_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "hr_payroll_records_school_id_id_key" ON "hr_payroll_records"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "hr_payroll_records_school_id_teacher_id_month_key" ON "hr_payroll_records"("school_id", "teacher_id", "month");

-- CreateIndex
CREATE INDEX "attendance_sessions_school_id_date_idx" ON "attendance_sessions"("school_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_school_id_id_key" ON "attendance_sessions"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_school_id_class_id_date_session_key" ON "attendance_sessions"("school_id", "class_id", "date", "session");

-- CreateIndex
CREATE INDEX "attendance_records_school_id_student_id_idx" ON "attendance_records"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_school_id_id_key" ON "attendance_records"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_school_id_session_id_student_id_key" ON "attendance_records"("school_id", "session_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_stats_school_id_id_key" ON "attendance_stats"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_stats_school_id_student_id_academic_year_key" ON "attendance_stats"("school_id", "student_id", "academic_year");

-- CreateIndex
CREATE UNIQUE INDEX "absentee_flags_school_id_id_key" ON "absentee_flags"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "absentee_flags_school_id_student_id_month_str_key" ON "absentee_flags"("school_id", "student_id", "month_str");

-- CreateIndex
CREATE UNIQUE INDEX "examinations_school_id_id_key" ON "examinations"("school_id", "id");

-- CreateIndex
CREATE INDEX "assessments_school_id_class_id_idx" ON "assessments"("school_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessments_school_id_id_key" ON "assessments"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_grades_school_id_id_key" ON "assessment_grades"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_grades_school_id_assessment_id_student_id_key" ON "assessment_grades"("school_id", "assessment_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_card_templates_school_id_id_key" ON "report_card_templates"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "report_card_templates_school_id_template_type_key" ON "report_card_templates"("school_id", "template_type");

-- CreateIndex
CREATE INDEX "report_cards_school_id_student_id_idx" ON "report_cards"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_cards_school_id_id_key" ON "report_cards"("school_id", "id");

-- CreateIndex
CREATE INDEX "homework_assignments_school_id_class_id_idx" ON "homework_assignments"("school_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "homework_assignments_school_id_id_key" ON "homework_assignments"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "homework_submissions_school_id_id_key" ON "homework_submissions"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "homework_submissions_school_id_homework_id_student_id_key" ON "homework_submissions"("school_id", "homework_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_collection_periods_school_id_id_key" ON "fee_collection_periods"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_school_id_id_key" ON "fee_structures"("school_id", "id");

-- CreateIndex
CREATE INDEX "invoices_school_id_student_id_idx" ON "invoices"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "invoices_school_id_status_due_date_idx" ON "invoices"("school_id", "status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_school_id_id_key" ON "invoices"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "library_categories_school_id_id_key" ON "library_categories"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "library_categories_school_id_name_key" ON "library_categories"("school_id", "name");

-- CreateIndex
CREATE INDEX "library_books_school_id_title_idx" ON "library_books"("school_id", "title");

-- CreateIndex
CREATE UNIQUE INDEX "library_books_school_id_id_key" ON "library_books"("school_id", "id");

-- CreateIndex
CREATE INDEX "library_book_issues_school_id_student_id_idx" ON "library_book_issues"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_book_issues_school_id_id_key" ON "library_book_issues"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "transport_vehicles_school_id_id_key" ON "transport_vehicles"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "transport_vehicles_school_id_registration_number_key" ON "transport_vehicles"("school_id", "registration_number");

-- CreateIndex
CREATE UNIQUE INDEX "transport_routes_school_id_id_key" ON "transport_routes"("school_id", "id");

-- CreateIndex
CREATE INDEX "route_stops_school_id_route_id_idx" ON "route_stops"("school_id", "route_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_school_id_id_key" ON "route_stops"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_categories_school_id_id_key" ON "inventory_categories"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_categories_school_id_name_key" ON "inventory_categories"("school_id", "name");

-- CreateIndex
CREATE INDEX "inventory_items_school_id_name_idx" ON "inventory_items"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_school_id_id_key" ON "inventory_items"("school_id", "id");

-- CreateIndex
CREATE INDEX "inventory_audit_logs_school_id_item_id_idx" ON "inventory_audit_logs"("school_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_audit_logs_school_id_id_key" ON "inventory_audit_logs"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_rooms_school_id_id_key" ON "chat_rooms"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_rooms_school_id_student_id_teacher_id_key" ON "chat_rooms"("school_id", "student_id", "teacher_id");

-- CreateIndex
CREATE INDEX "chat_messages_school_id_chat_room_id_created_at_idx" ON "chat_messages"("school_id", "chat_room_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_school_id_id_key" ON "chat_messages"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "broadcast_channels_school_id_id_key" ON "broadcast_channels"("school_id", "id");

-- CreateIndex
CREATE INDEX "channel_posts_school_id_channel_id_created_at_idx" ON "channel_posts"("school_id", "channel_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "channel_posts_school_id_id_key" ON "channel_posts"("school_id", "id");

-- CreateIndex
CREATE INDEX "notices_school_id_created_at_idx" ON "notices"("school_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notices_school_id_id_key" ON "notices"("school_id", "id");

-- CreateIndex
CREATE INDEX "notifications_school_id_user_id_read_idx" ON "notifications"("school_id", "user_id", "read");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_school_id_id_key" ON "notifications"("school_id", "id");

-- CreateIndex
CREATE INDEX "leave_applications_school_id_status_idx" ON "leave_applications"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "leave_applications_school_id_id_key" ON "leave_applications"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_approval_rules_school_id_id_key" ON "leave_approval_rules"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ptm_appointments_school_id_id_key" ON "ptm_appointments"("school_id", "id");

-- CreateIndex
CREATE INDEX "canteen_requests_school_id_status_idx" ON "canteen_requests"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "canteen_requests_school_id_id_key" ON "canteen_requests"("school_id", "id");

-- CreateIndex
CREATE INDEX "complaints_school_id_status_idx" ON "complaints"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "complaints_school_id_id_key" ON "complaints"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_modules_school_id_id_key" ON "custom_modules"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_modules_school_id_name_key" ON "custom_modules"("school_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "custom_form_schemas_school_id_id_key" ON "custom_form_schemas"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_form_schemas_school_id_module_key_key" ON "custom_form_schemas"("school_id", "module_key");

-- CreateIndex
CREATE INDEX "custom_module_records_school_id_custom_module_id_idx" ON "custom_module_records"("school_id", "custom_module_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_module_records_school_id_id_key" ON "custom_module_records"("school_id", "id");

-- CreateIndex
CREATE INDEX "admission_leads_school_id_status_idx" ON "admission_leads"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "admission_leads_school_id_id_key" ON "admission_leads"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_forms_school_id_id_key" ON "lead_forms"("school_id", "id");

-- CreateIndex
CREATE INDEX "admission_applications_school_id_status_idx" ON "admission_applications"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_school_id_id_key" ON "admission_applications"("school_id", "id");

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_school_role_id_fkey" FOREIGN KEY ("school_role_id") REFERENCES "school_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_school_role_id_fkey" FOREIGN KEY ("school_role_id") REFERENCES "school_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_student_links" ADD CONSTRAINT "parent_student_links_school_id_parent_profile_id_fkey" FOREIGN KEY ("school_id", "parent_profile_id") REFERENCES "parent_profiles"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_student_links" ADD CONSTRAINT "parent_student_links_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_roles" ADD CONSTRAINT "school_roles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_categories" ADD CONSTRAINT "class_categories_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "class_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_class_teacher_id_fkey" FOREIGN KEY ("class_teacher_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_school_id_class_id_fkey" FOREIGN KEY ("school_id", "class_id") REFERENCES "classes"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_periods" ADD CONSTRAINT "timetable_periods_school_id_class_id_fkey" FOREIGN KEY ("school_id", "class_id") REFERENCES "classes"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_periods" ADD CONSTRAINT "timetable_periods_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_periods" ADD CONSTRAINT "timetable_periods_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_periods" ADD CONSTRAINT "timetable_periods_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_events" ADD CONSTRAINT "academic_calendar_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_school_id_teacher_id_fkey" FOREIGN KEY ("school_id", "teacher_id") REFERENCES "staff_profiles"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_school_id_class_id_fkey" FOREIGN KEY ("school_id", "class_id") REFERENCES "classes"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_resources" ADD CONSTRAINT "academic_resources_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_resources" ADD CONSTRAINT "academic_resources_school_id_class_id_fkey" FOREIGN KEY ("school_id", "class_id") REFERENCES "classes"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_resources" ADD CONSTRAINT "academic_resources_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_transport_route_id_fkey" FOREIGN KEY ("transport_route_id") REFERENCES "transport_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_pickup_stop_id_fkey" FOREIGN KEY ("pickup_stop_id") REFERENCES "route_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_profiles" ADD CONSTRAINT "parent_profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_profiles" ADD CONSTRAINT "parent_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_assigned_class_id_fkey" FOREIGN KEY ("assigned_class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_payroll_records" ADD CONSTRAINT "hr_payroll_records_school_id_teacher_id_fkey" FOREIGN KEY ("school_id", "teacher_id") REFERENCES "staff_profiles"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_school_id_class_id_fkey" FOREIGN KEY ("school_id", "class_id") REFERENCES "classes"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_school_id_session_id_fkey" FOREIGN KEY ("school_id", "session_id") REFERENCES "attendance_sessions"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_stats" ADD CONSTRAINT "attendance_stats_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absentee_flags" ADD CONSTRAINT "absentee_flags_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absentee_flags" ADD CONSTRAINT "absentee_flags_school_id_class_id_fkey" FOREIGN KEY ("school_id", "class_id") REFERENCES "classes"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "examinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_school_id_class_id_fkey" FOREIGN KEY ("school_id", "class_id") REFERENCES "classes"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_grades" ADD CONSTRAINT "assessment_grades_school_id_assessment_id_fkey" FOREIGN KEY ("school_id", "assessment_id") REFERENCES "assessments"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_grades" ADD CONSTRAINT "assessment_grades_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_card_templates" ADD CONSTRAINT "report_card_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_school_id_class_id_fkey" FOREIGN KEY ("school_id", "class_id") REFERENCES "classes"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_school_id_subject_id_fkey" FOREIGN KEY ("school_id", "subject_id") REFERENCES "subjects"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_school_id_homework_id_fkey" FOREIGN KEY ("school_id", "homework_id") REFERENCES "homework_assignments"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_collection_periods" ADD CONSTRAINT "fee_collection_periods_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_school_id_class_id_fkey" FOREIGN KEY ("school_id", "class_id") REFERENCES "classes"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_collection_period_id_fkey" FOREIGN KEY ("collection_period_id") REFERENCES "fee_collection_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_fee_structure_id_fkey" FOREIGN KEY ("school_id", "fee_structure_id") REFERENCES "fee_structures"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_collection_period_id_fkey" FOREIGN KEY ("collection_period_id") REFERENCES "fee_collection_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_categories" ADD CONSTRAINT "library_categories_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "library_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_book_issues" ADD CONSTRAINT "library_book_issues_school_id_book_id_fkey" FOREIGN KEY ("school_id", "book_id") REFERENCES "library_books"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_book_issues" ADD CONSTRAINT "library_book_issues_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_vehicles" ADD CONSTRAINT "transport_vehicles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "transport_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_school_id_route_id_fkey" FOREIGN KEY ("school_id", "route_id") REFERENCES "transport_routes"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_categories" ADD CONSTRAINT "inventory_categories_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "inventory_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_audit_logs" ADD CONSTRAINT "inventory_audit_logs_school_id_item_id_fkey" FOREIGN KEY ("school_id", "item_id") REFERENCES "inventory_items"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_school_id_teacher_id_fkey" FOREIGN KEY ("school_id", "teacher_id") REFERENCES "staff_profiles"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_school_id_chat_room_id_fkey" FOREIGN KEY ("school_id", "chat_room_id") REFERENCES "chat_rooms"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_channels" ADD CONSTRAINT "broadcast_channels_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_channels" ADD CONSTRAINT "broadcast_channels_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_posts" ADD CONSTRAINT "channel_posts_school_id_channel_id_fkey" FOREIGN KEY ("school_id", "channel_id") REFERENCES "broadcast_channels"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_rules" ADD CONSTRAINT "leave_approval_rules_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_rules" ADD CONSTRAINT "leave_approval_rules_school_id_role_id_fkey" FOREIGN KEY ("school_id", "role_id") REFERENCES "school_roles"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ptm_appointments" ADD CONSTRAINT "ptm_appointments_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ptm_appointments" ADD CONSTRAINT "ptm_appointments_school_id_teacher_id_fkey" FOREIGN KEY ("school_id", "teacher_id") REFERENCES "staff_profiles"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ptm_appointments" ADD CONSTRAINT "ptm_appointments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canteen_requests" ADD CONSTRAINT "canteen_requests_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_modules" ADD CONSTRAINT "custom_modules_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_form_schemas" ADD CONSTRAINT "custom_form_schemas_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_module_records" ADD CONSTRAINT "custom_module_records_school_id_custom_module_id_fkey" FOREIGN KEY ("school_id", "custom_module_id") REFERENCES "custom_modules"("school_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_leads" ADD CONSTRAINT "admission_leads_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_forms" ADD CONSTRAINT "lead_forms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
