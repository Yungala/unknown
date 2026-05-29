import { z } from 'zod';

/**
 * 클라이언트에 노출되는 환경 변수의 단일 출처(SSOT).
 * 빌드/런타임 양쪽에서 누락된 값이 있으면 즉시 실패시킨다.
 */
const envSchema = z.object({
  VITE_APP_NAME: z.string().min(1).default('Template React MVP'),
  VITE_API_BASE_URL: z.string().url(),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  console.error(
    'Invalid environment variables:',
    parsed.error.flatten().fieldErrors,
  );
  throw new Error('Invalid environment variables. See .env.example.');
}

export const env = parsed.data;
export type Env = typeof env;
