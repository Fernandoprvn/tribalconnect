import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: Role;
        username: string;
        familyId?: string | null;
        districtId?: string | null;
      };
    }
  }
}

export {};
