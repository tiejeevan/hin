import { test, expect } from '@playwright/test';
import { DEFAULT_PASSWORD, uniqueUsername } from './helpers/auth';
import {
  createPostViaApi,
  registerViaApi,
} from './helpers/follows';
import { createCommentViaApi } from './helpers/permalinks';
import {
  createReportViaApi,
  listReportsViaApi,
  reviewReportViaApi,
} from './helpers/reports';

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

async function loginAdminViaApi(): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '087425' }),
  });
  if (!res.ok) throw new Error(`Admin login failed: ${await res.text()}`);
  const data = await res.json();
  return data.token;
}

test.describe('Reports API', () => {
  test('submit report on post', async () => {
    const author = await registerViaApi(uniqueUsername('rpt_post_author'), DEFAULT_PASSWORD);
    const reporter = await registerViaApi(uniqueUsername('rpt_post_reporter'), DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Report me ${Date.now()}`);

    const res = await createReportViaApi(reporter.token, {
      targetType: 'post',
      targetId: post.id,
      reason: 'spam',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('submit report on comment', async () => {
    const author = await registerViaApi(uniqueUsername('rpt_comment_author'), DEFAULT_PASSWORD);
    const reporter = await registerViaApi(uniqueUsername('rpt_comment_reporter'), DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Comment target ${Date.now()}`);
    const comment = await createCommentViaApi(reporter.token, post.id, 'Actually reporting someone else comment');
    const other = await registerViaApi(uniqueUsername('rpt_comment_other'), DEFAULT_PASSWORD);
    const targetComment = await createCommentViaApi(author.token, post.id, 'Bad comment here');

    const res = await createReportViaApi(other.token, {
      targetType: 'comment',
      targetId: targetComment.id,
      reason: 'harassment',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    void comment;
  });

  test('submit report on user', async () => {
    const target = await registerViaApi(uniqueUsername('rpt_user_target'), DEFAULT_PASSWORD);
    const reporter = await registerViaApi(uniqueUsername('rpt_user_reporter'), DEFAULT_PASSWORD);

    const res = await createReportViaApi(reporter.token, {
      targetType: 'user',
      targetId: target.userId,
      reason: 'hate',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('duplicate pending report rejected', async () => {
    const author = await registerViaApi(uniqueUsername('rpt_dup_author'), DEFAULT_PASSWORD);
    const reporter = await registerViaApi(uniqueUsername('rpt_dup_reporter'), DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Dup report ${Date.now()}`);

    const first = await createReportViaApi(reporter.token, {
      targetType: 'post',
      targetId: post.id,
      reason: 'spam',
    });
    expect(first.status).toBe(200);

    const second = await createReportViaApi(reporter.token, {
      targetType: 'post',
      targetId: post.id,
      reason: 'other',
    });
    expect(second.status).toBe(409);
  });

  test('admin dismisses report', async () => {
    const author = await registerViaApi(uniqueUsername('rpt_dismiss_author'), DEFAULT_PASSWORD);
    const reporter = await registerViaApi(uniqueUsername('rpt_dismiss_reporter'), DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Dismiss report ${Date.now()}`);

    await createReportViaApi(reporter.token, {
      targetType: 'post',
      targetId: post.id,
      reason: 'spam',
    });

    const adminToken = await loginAdminViaApi();
    const list = await listReportsViaApi(adminToken);
    const report = list.reports.find((r: { targetId: number }) => r.targetId === post.id);
    expect(report).toBeTruthy();

    const review = await reviewReportViaApi(adminToken, report.id, 'dismiss');
    expect(review.status).toBe(200);
    expect(review.data.report.status).toBe('dismissed');
  });

  test('admin delete_content soft-deletes post', async () => {
    const author = await registerViaApi(uniqueUsername('rpt_delete_author'), DEFAULT_PASSWORD);
    const reporter = await registerViaApi(uniqueUsername('rpt_delete_reporter'), DEFAULT_PASSWORD);
    const post = await createPostViaApi(author.token, `Delete via report ${Date.now()}`);

    await createReportViaApi(reporter.token, {
      targetType: 'post',
      targetId: post.id,
      reason: 'misinformation',
    });

    const adminToken = await loginAdminViaApi();
    const list = await listReportsViaApi(adminToken);
    const report = list.reports.find((r: { targetId: number }) => r.targetId === post.id);
    expect(report).toBeTruthy();

    const review = await reviewReportViaApi(adminToken, report.id, 'delete_content');
    expect(review.status).toBe(200);

    const getRes = await fetch(`${API_URL}/api/posts/${post.id}`);
    expect(getRes.status).toBe(404);
  });
});
