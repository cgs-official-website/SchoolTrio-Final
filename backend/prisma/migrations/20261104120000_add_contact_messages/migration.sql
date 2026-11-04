-- CreateTable
CREATE TABLE "contact_messages" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255),
    "message" TEXT NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'new',
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(255),
    "reply" TEXT,
    "replied_at" TIMESTAMP(3),
    "replied_by" VARCHAR(200),
    "email_delivery_status" VARCHAR(50),
    "email_delivery_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_message_replies" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "admin_id" UUID,
    "admin_name" VARCHAR(200) NOT NULL,
    "reply_text" TEXT NOT NULL,
    "email_delivery_status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "email_delivery_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_message_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_messages_status_idx" ON "contact_messages"("status");
CREATE INDEX "contact_messages_created_at_idx" ON "contact_messages"("created_at");
CREATE INDEX "contact_messages_email_idx" ON "contact_messages"("email");

-- CreateIndex
CREATE INDEX "contact_message_replies_message_id_created_at_idx" ON "contact_message_replies"("message_id", "created_at");

-- AddForeignKey
ALTER TABLE "contact_message_replies" ADD CONSTRAINT "contact_message_replies_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "contact_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_message_replies" ADD CONSTRAINT "contact_message_replies_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

