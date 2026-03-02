export const TIER_DEFAULTS = {
  FREE: {
    maxPapersPerDay: 10,
    maxPapersPerMonth: 100,
    maxTokensPerMonth: 1_000_000,
  },
  PRO: {
    maxPapersPerDay: 50,
    maxPapersPerMonth: 500,
    maxTokensPerMonth: 10_000_000,
  },
  ADMIN: {
    maxPapersPerDay: 999,
    maxPapersPerMonth: 9999,
    maxTokensPerMonth: 100_000_000,
  },
} as const;

export type TierName = keyof typeof TIER_DEFAULTS;
