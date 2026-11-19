import assert from "node:assert/strict";
import test from "node:test";
import { createSessionCookie, getCurrentAdmin, verifyAdminCredentials } from "./auth";

test("third CRM admin can log in and keep a valid session", async () => {
  const previousLogin = process.env.CRM_ADMIN_3_LOGIN;
  const previousPassword = process.env.CRM_ADMIN_3_PASSWORD;

  try {
    process.env.CRM_ADMIN_3_LOGIN = "third-admin@example.test";
    process.env.CRM_ADMIN_3_PASSWORD = "test-password-3";

    const admin = verifyAdminCredentials("third-admin@example.test", "test-password-3");
    assert.deepEqual(admin, { login: "third-admin@example.test", label: "Admin 3" });
    assert.ok(admin);
    assert.equal(verifyAdminCredentials("third-admin@example.test", "wrong-password"), null);

    const request = new Request("http://localhost/");
    const cookie = await createSessionCookie(admin, request);
    const sessionRequest = new Request("http://localhost/", {
      headers: { cookie: cookie.split(";")[0] },
    });
    assert.deepEqual(await getCurrentAdmin(sessionRequest), admin);
  } finally {
    if (previousLogin === undefined) delete process.env.CRM_ADMIN_3_LOGIN;
    else process.env.CRM_ADMIN_3_LOGIN = previousLogin;
    if (previousPassword === undefined) delete process.env.CRM_ADMIN_3_PASSWORD;
    else process.env.CRM_ADMIN_3_PASSWORD = previousPassword;
  }
});
