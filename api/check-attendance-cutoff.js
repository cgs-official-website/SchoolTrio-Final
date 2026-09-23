// Initialize Prisma Client and Tenant Context Helper
async function getPrismaModule() {
  try {
    const mod = await import('../backend/src/database/prisma.client.js')
      .catch(() => import('./backend/src/database/prisma.client.js'))
      .catch(() => import('@prisma/client'));
    return {
      prisma: mod.prisma || (mod.PrismaClient ? new mod.PrismaClient() : null),
      runWithTenantContext: mod.runWithTenantContext || ((_ctx, fn) => fn())
    };
  } catch (err) {
    console.error("Prisma Client initialization failed:", err);
    return { prisma: null, runWithTenantContext: (_ctx, fn) => fn() };
  }
}

export default async function handler(req, res) {
  const { prisma, runWithTenantContext } = await getPrismaModule();
  if (!prisma) {
    return res.status(500).json({ error: 'PostgreSQL Database Client not initialized' });
  }

  try {
    // 1. Fetch active institutional schools from PostgreSQL (Global platform scope)
    const schools = await runWithTenantContext({ bypassTenant: true }, async () => {
      return prisma.school.findMany({
        where: {
          status: { not: 'pending' }
        },
        select: {
          id: true,
          name: true,
          code: true,
          timezone: true
        }
      });
    });

    const results = [];

    for (const school of schools) {
      const schoolId = school.id;

      const schoolResult = await runWithTenantContext({ schoolId }, async () => {
        // 2. Fetch attendance settings from PostgreSQL SchoolSetting
        const settingRow = await prisma.schoolSetting.findFirst({
          where: {
            schoolId,
            category: 'attendanceSettings'
          }
        });

        const settingsData = settingRow?.data || {};
        const cutoffTimeStr = settingsData.cutoffTime || '09:30';
        const tz = settingsData.timezone || school.timezone || 'Asia/Kolkata';

        // 3. Calculate today's date and current time in the school's configured timezone
        const now = new Date();
        let localDateStr = '';
        let localTimeStr = '';

        try {
          localDateStr = now.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
          localTimeStr = now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }); // HH:mm
        } catch {
          // Fallback: UTC
          localDateStr = now.toISOString().split('T')[0];
          localTimeStr = now.toISOString().slice(11, 16);
        }

        // 4. Idempotency Check: Skip if already checked today
        if (settingsData.lastCutoffCheckDate === localDateStr) {
          return {
            schoolId,
            schoolCode: school.code,
            status: 'SKIPPED_ALREADY_CHECKED_TODAY',
            localDate: localDateStr
          };
        }

        // 5. Cutoff Time Check: Skip if currently before cutoff time
        if (localTimeStr < cutoffTimeStr) {
          return {
            schoolId,
            schoolCode: school.code,
            status: 'SKIPPED_BEFORE_CUTOFF',
            time: localTimeStr,
            cutoff: cutoffTimeStr
          };
        }

        // 6. Fetch active classes and today's attendance sessions from PostgreSQL
        const [classes, todaySessions] = await Promise.all([
          prisma.class.findMany({
            where: { schoolId },
            select: { id: true, name: true }
          }),
          prisma.attendanceSession.findMany({
            where: { schoolId, date: localDateStr },
            select: { classId: true }
          })
        ]);

        const markedClassIds = new Set(todaySessions.map(s => s.classId));
        const unmarkedClasses = [];

        for (const cls of classes) {
          if (!markedClassIds.has(cls.id)) {
            unmarkedClasses.push(cls.name || 'Class');

            // 6a. Authoritative PostgreSQL Notification Producer (Concurrency-Safe Idempotent Creation)
            try {
              await prisma.$transaction(async (tx) => {
                // Acquire transaction-scoped advisory lock for (schoolId, classId, date, 'attendance_pending')
                // pg_advisory_xact_lock serializes any concurrent attempts targeting the exact same identity
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${`${cls.id}:${localDateStr}:attendance_pending`}))`;

                const existingNotif = await tx.notification.findFirst({
                  where: {
                    schoolId,
                    classId: cls.id,
                    date: localDateStr,
                    type: 'attendance_pending',
                    read: false
                  }
                });

                if (!existingNotif) {
                  await tx.notification.create({
                    data: {
                      schoolId,
                      classId: cls.id,
                      userId: null, // Administrative/school-wide alert
                      type: 'attendance_pending',
                      message: `${cls.name} attendance not marked`,
                      date: localDateStr,
                      read: false
                    }
                  });
                }
              });
            } catch (notifErr) {
              console.warn(`Failed to create PostgreSQL attendance notification for ${cls.name}:`, notifErr.message);
            }
          }
        }

        // 7. Update lastCutoffCheckDate in PostgreSQL SchoolSetting (Idempotency Record)
        const updatedSettingsData = {
          ...settingsData,
          lastCutoffCheckDate: localDateStr
        };

        await prisma.schoolSetting.upsert({
          where: {
            schoolId_category: {
              schoolId,
              category: 'attendanceSettings'
            }
          },
          create: {
            schoolId,
            category: 'attendanceSettings',
            data: updatedSettingsData
          },
          update: {
            data: updatedSettingsData
          }
        });

        return {
          schoolId,
          schoolCode: school.code,
          status: 'PROCESSED',
          localDate: localDateStr,
          unmarkedClassesCount: unmarkedClasses.length,
          unmarkedClasses
        };
      });

      if (schoolResult) {
        results.push(schoolResult);
      }
    }

    return res.status(200).json({ success: true, results });
  } catch (error) {
    console.error("Error running PostgreSQL attendance cutoff check:", error);
    return res.status(500).json({ error: error.message });
  }
}
