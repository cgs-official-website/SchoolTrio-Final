import { z } from 'zod';

export const sendEmailSchema = {
  body: z.object({
    to: z.union([
      z.string().email('Valid email address is required'),
      z.array(z.string().email('Each recipient must be a valid email')).min(1)
    ]),
    subject: z.string().trim().min(1, 'Subject is required').max(255),
    html: z.string().optional(),
    text: z.string().optional()
  }).refine(data => Boolean(data.html || data.text), {
    message: 'Either html or text content must be provided'
  })
};
