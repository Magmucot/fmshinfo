import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).transform(value => value || null).nullable().optional();
const subgroup = z.union([z.literal(1), z.literal(2)]).nullable().optional();
const className = z.string().trim().regex(/^\d{1,2}-\d{1,2}$/).nullable().optional();

export const telegramPayload = z.object({
  id: z.union([
    z.number().int().positive().safe().transform(String),
    z.string().regex(/^[1-9]\d{0,15}$/).refine(value => Number.isSafeInteger(Number(value))),
  ]),
  username: optionalText(64).transform(value => typeof value === "string" ? value.replace(/^@/, "") || null : value),
  firstName: optionalText(200),
  lastName: optionalText(200),
  className,
  subgroup,
  englishGroup: optionalText(200),
  languageCode: optionalText(35),
  isPremium: z.boolean().optional(),
  action: optionalText(200),
});

export const webPayload = z.object({
  clientId: z.string().trim().min(1).max(128),
  className,
  subgroup,
  userAgent: optionalText(500),
  path: optionalText(200),
});

export const feedbackPayload = z.object({
  name: z.string().trim().min(1).max(200),
  contact: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(4000),
});
