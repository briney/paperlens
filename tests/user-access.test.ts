import assert from "node:assert/strict";
import test from "node:test";
import { getSubmissionAccessError, isUserSubmissionApproved } from "@/lib/user-access";

test("getSubmissionAccessError returns null for approved users", () => {
  const result = getSubmissionAccessError({ approvalStatus: "APPROVED" });
  assert.equal(result, null);
});

test("getSubmissionAccessError blocks pending users", () => {
  const result = getSubmissionAccessError({ approvalStatus: "PENDING" });
  assert.deepEqual(result, {
    status: 403,
    code: "ACCOUNT_PENDING_APPROVAL",
    error: "Your account is pending admin approval.",
  });
});

test("getSubmissionAccessError blocks rejected users", () => {
  const result = getSubmissionAccessError({ approvalStatus: "REJECTED" });
  assert.deepEqual(result, {
    status: 403,
    code: "ACCOUNT_NOT_APPROVED",
    error: "Your account is not approved for job submissions.",
  });
});

test("isUserSubmissionApproved only returns true for approved", () => {
  assert.equal(isUserSubmissionApproved({ approvalStatus: "APPROVED" }), true);
  assert.equal(isUserSubmissionApproved({ approvalStatus: "PENDING" }), false);
  assert.equal(isUserSubmissionApproved({ approvalStatus: "REJECTED" }), false);
});
