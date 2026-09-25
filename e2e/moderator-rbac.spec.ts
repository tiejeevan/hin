import { test, expect } from '@playwright/test';
import { DEFAULT_PASSWORD, loginUser, uniqueUsername } from './helpers/auth';
import { createPostViaApi, registerViaApi } from './helpers/follows';
import { createReportViaApi, listReportsViaApi } from './helpers/reports';
import {
  bootstrapViaApi,
  hidePostViaApi,
  loginAdminViaApi,
  loginViaApi,
  moderationDashboardViaApi,
  promoteModeratorViaApi,
  removeModeratorViaApi,
  restrictUserViaApi,
  reviewReportExtendedViaApi,
  suspendUserViaApi,
  unsuspendUserViaApi,
  createPostRawViaApi,
} from './helpers/moderation';

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

const MOD_PERMS = [
  'report.view',
  'report.resolve',
  'report.escalate',
  'post.hide',
  'user.restrict',
  'user.suspend',
  'user.unsuspend',
] as const;

test.describe('Moderator RBAC smoke (main flows)', () => {
  test.describe.configure({ mode: 'serial' });

  test('API: promote, permissions, hide, reports, restrict, suspend', async () => {
    const adminToken = await loginAdminViaApi();
    const mod = await registerViaApi(uniqueUsername('mod_smoke'), DEFAULT_PASSWORD);
    const author = await registerViaApi(uniqueUsername('mod_author'), DEFAULT_PASSWORD);
    const reporter = await registerViaApi(uniqueUsername('mod_reporter'), DEFAULT_PASSWORD);

    const promote = await promoteModeratorViaApi(adminToken, mod.userId, [...MOD_PERMS]);
    expect(promote.status).toBe(200);

    const boot = await bootstrapViaApi(mod.token);
    expect(boot.status).toBe(200);
    expect(boot.data.permissions).toEqual(expect.arrayContaining(['post.hide', 'report.view']));

    const dash = await moderationDashboardViaApi(mod.token);
    expect(dash.status).toBe(200);

    const postHide = await createPostViaApi(author.token, `Hide smoke ${Date.now()}`);
    const hide = await hidePostViaApi(mod.token, postHide.id, 'E2E hide');
    expect(hide.status).toBe(200);
    expect((await fetch(`${API_URL}/api/posts/${postHide.id}`)).status).toBe(404);

    const postReport = await createPostViaApi(author.token, `Resolve smoke ${Date.now()}`);
    await createReportViaApi(reporter.token, {
      targetType: 'post',
      targetId: postReport.id,
      reason: 'spam',
    });
    const list = await listReportsViaApi(mod.token);
    const toResolve = list.reports.find((r: { targetId: number }) => r.targetId === postReport.id);
    expect(toResolve).toBeTruthy();
    const resolved = await reviewReportExtendedViaApi(
      mod.token,
      toResolve.id,
      'resolve',
      'E2E resolved',
    );
    expect(resolved.status).toBe(200);
    expect(resolved.data.report?.status).toBe('resolved');

    const postEsc = await createPostViaApi(author.token, `Escalate smoke ${Date.now()}`);
    await createReportViaApi(reporter.token, {
      targetType: 'post',
      targetId: postEsc.id,
      reason: 'other',
    });
    const list2 = await listReportsViaApi(mod.token);
    const toEsc = list2.reports.find((r: { targetId: number }) => r.targetId === postEsc.id);
    expect(toEsc).toBeTruthy();
    const escalated = await reviewReportExtendedViaApi(mod.token, toEsc.id, 'escalate');
    expect(escalated.status).toBe(200);
    const modResolveEscalated = await reviewReportExtendedViaApi(
      mod.token,
      toEsc.id,
      'resolve',
      'should fail',
    );
    expect(modResolveEscalated.status).toBe(403);
    expect((await reviewReportExtendedViaApi(adminToken, toEsc.id, 'delete_content')).status).toBe(200);

    const restrict = await restrictUserViaApi(mod.token, reporter.userId, 'E2E restrict');
    expect(restrict.status).toBe(200);
    const restrictedPost = await createPostRawViaApi(reporter.token, 'blocked');
    expect(restrictedPost.status).toBe(403);
    expect(restrictedPost.data.code).toBe('account_restricted');

    const authorUsername = uniqueUsername('mod_suspend_check');
    const suspendVictim = await registerViaApi(authorUsername, DEFAULT_PASSWORD);
    const suspend = await suspendUserViaApi(mod.token, suspendVictim.userId, 'E2E suspend');
    expect(suspend.status).toBe(200);
    const loginBlocked = await loginViaApi(authorUsername, DEFAULT_PASSWORD);
    expect(loginBlocked.status).toBe(403);
    expect(loginBlocked.data.code).toBe('account_suspended');
    expect((await bootstrapViaApi(suspendVictim.token)).status).toBe(403);
    expect((await unsuspendUserViaApi(adminToken, suspendVictim.userId)).status).toBe(200);
    expect((await loginViaApi(authorUsername, DEFAULT_PASSWORD)).status).toBe(200);

    expect((await removeModeratorViaApi(adminToken, mod.userId)).status).toBe(200);
  });

  test('UI: moderator dashboard route', async ({ page }) => {
    const modUsername = uniqueUsername('mod_ui');
    const mod = await registerViaApi(modUsername, DEFAULT_PASSWORD);
    const adminToken = await loginAdminViaApi();
    await promoteModeratorViaApi(adminToken, mod.userId, ['report.view']);

    await loginUser(page, modUsername, DEFAULT_PASSWORD);
    await page.goto('/moderator');
    await expect(page.getByRole('heading', { name: 'Moderator Dashboard' })).toBeVisible();

    await removeModeratorViaApi(adminToken, mod.userId);
  });
});
