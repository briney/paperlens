import type { AuthUser } from "@/lib/auth";

export interface SubmissionAccessError {
  status: number;
  code: string;
  error: string;
}

export function getSubmissionAccessError(
  user: Pick<AuthUser, "approvalStatus">
): SubmissionAccessError | null {
  if (user.approvalStatus === "APPROVED") {
    return null;
  }

  if (user.approvalStatus === "PENDING") {
    return {
      status: 403,
      code: "ACCOUNT_PENDING_APPROVAL",
      error: "Your account is pending admin approval.",
    };
  }

  return {
    status: 403,
    code: "ACCOUNT_NOT_APPROVED",
    error: "Your account is not approved for job submissions.",
  };
}

export function isUserSubmissionApproved(user: Pick<AuthUser, "approvalStatus">): boolean {
  return user.approvalStatus === "APPROVED";
}
