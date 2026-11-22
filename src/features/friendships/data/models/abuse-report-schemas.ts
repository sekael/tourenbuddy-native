import { z } from 'zod';

export const abuseReportSchema = z.object({
  reportedUserId: z.string().guid(),
  reason: z.string().max(1000).nullable(),
});

export type AbuseReport = z.infer<typeof abuseReportSchema>;
