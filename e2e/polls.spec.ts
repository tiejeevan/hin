import { test, expect } from '@playwright/test';
import {
  DEFAULT_PASSWORD,
  registerUser,
  uniqueUsername,
} from './helpers/auth';
import {
  createPollPost,
  expectPollResultsHidden,
  expectPollVoteCount,
  fillPollDraft,
  openCreatePostForm,
  enablePollOnCreateForm,
  pollArticle,
  publishPost,
  voteMultiChoice,
  voteSingleChoice,
} from './helpers/polls';

test.describe('Poll creation', () => {
  test('creates a poll post and shows it in the feed', async ({ page }) => {
    const username = uniqueUsername('poll_author');
    await registerUser(page, username);

    const question = `Favorite color ${Date.now()}?`;
    await createPollPost(page, {
      question,
      options: ['Blue', 'Green'],
      postContent: 'Quick poll for the team',
    });

    const poll = pollArticle(page, question);
    await expect(poll).toBeVisible();
    await expect(poll.getByText(question)).toBeVisible();
    await expect(poll.getByRole('button', { name: 'Blue' })).toBeVisible();
    await expect(poll.getByRole('button', { name: 'Green' })).toBeVisible();
    await expect(poll.getByText('Quick poll for the team')).toBeVisible();
    await expectPollVoteCount(poll, 0);
  });

  test('requires a poll question before publishing', async ({ page }) => {
    await registerUser(page, uniqueUsername('poll_validate'));

    await openCreatePostForm(page);
    await enablePollOnCreateForm(page);
    await fillPollDraft(page, {
      question: '',
      options: ['Yes', 'No'],
    });
    await page.getByRole('button', { name: 'Publish post' }).click();

    await expect(page.getByText('Enter a poll question or statement')).toBeVisible();
    await expect(page.getByPlaceholder('What is on your mind?')).toBeVisible();
  });

  test('requires at least two poll options before publishing', async ({ page }) => {
    await registerUser(page, uniqueUsername('poll_options'));

    await openCreatePostForm(page);
    await enablePollOnCreateForm(page);
    await page.getByPlaceholder('Ask a question or write a statement…').fill('One option only?');
    await page.getByPlaceholder('Option 1').fill('Only one');
    await page.getByPlaceholder('Option 2').fill('');
    await page.getByRole('button', { name: 'Publish post' }).click();

    await expect(page.getByText('Add at least 2 options')).toBeVisible();
  });
});

test.describe('Poll voting', () => {
  test('casts a single-choice vote and shows results', async ({ page }) => {
    const author = uniqueUsername('poll_voter_single');
    await registerUser(page, author);

    const question = `Best snack ${Date.now()}?`;
    await createPollPost(page, {
      question,
      options: ['Chips', 'Fruit'],
    });

    const poll = pollArticle(page, question);
    await voteSingleChoice(poll, 'Chips');

    await expect(poll.getByText('100% (1)')).toBeVisible();
    await expectPollVoteCount(poll, 1);
    await expect(poll.getByRole('button', { name: 'Remove vote' })).toBeVisible();
  });

  test('casts a multi-choice vote via submit button', async ({ page }) => {
    await registerUser(page, uniqueUsername('poll_voter_multi'));

    const question = `Pick toppings ${Date.now()}?`;
    await createPollPost(page, {
      question,
      options: ['Cheese', 'Peppers', 'Olives'],
      multiChoice: true,
      maxSelections: 2,
    });

    const poll = pollArticle(page, question);
    await expect(poll.getByText('Pick up to 2')).toBeVisible();

    await voteMultiChoice(poll, ['Cheese', 'Peppers']);

    await expectPollVoteCount(poll, 1);
    await expect(poll.getByRole('button', { name: 'Update vote' })).toBeVisible();
  });

  test('retracts a vote when retraction is allowed', async ({ page }) => {
    await registerUser(page, uniqueUsername('poll_retract'));

    const question = `Keep or revert ${Date.now()}?`;
    await createPollPost(page, {
      question,
      options: ['Keep', 'Revert'],
    });

    const poll = pollArticle(page, question);
    await voteSingleChoice(poll, 'Keep');
    await expectPollVoteCount(poll, 1);

    await poll.getByRole('button', { name: 'Remove vote' }).click();

    await expectPollVoteCount(poll, 0);
    await expect(poll.getByRole('button', { name: 'Remove vote' })).not.toBeVisible();
  });

  test('allows changing a single-choice vote', async ({ page }) => {
    await registerUser(page, uniqueUsername('poll_change'));

    const question = `Morning or night ${Date.now()}?`;
    await createPollPost(page, {
      question,
      options: ['Morning', 'Night'],
      allowVoteChange: true,
    });

    const poll = pollArticle(page, question);
    await voteSingleChoice(poll, 'Morning');
    await expect(poll.getByText('100% (1)')).toBeVisible();

    await voteSingleChoice(poll, 'Night');

    await expect(poll.getByRole('button', { name: 'Night' })).toHaveClass(/border-indigo-500/);
    await expectPollVoteCount(poll, 1);
  });

  test('hides results until the viewer votes when visibility is after_vote', async ({ browser }) => {
    const author = uniqueUsername('poll_hidden_author');
    const voter = uniqueUsername('poll_hidden_voter');
    const password = DEFAULT_PASSWORD;
    const question = `Hidden results ${Date.now()}?`;

    const authorContext = await browser.newContext();
    const voterContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    const voterPage = await voterContext.newPage();

    try {
      await registerUser(authorPage, author, password);
      await createPollPost(authorPage, {
        question,
        options: ['Alpha', 'Beta'],
        resultsVisibility: 'Show after I vote',
      });

      await registerUser(voterPage, voter, password);
      const poll = pollArticle(voterPage, question);
      await expect(poll).toBeVisible();
      await expectPollResultsHidden(poll);

      await voteSingleChoice(poll, 'Alpha');

      await expectPollVoteCount(poll, 1);
      await expect(poll.getByText('100% (1)')).toBeVisible();
    } finally {
      await authorContext.close();
      await voterContext.close();
    }
  });

  test('another user can vote on an existing poll', async ({ browser }) => {
    const author = uniqueUsername('poll_two_user_author');
    const voter = uniqueUsername('poll_two_user_voter');
    const password = DEFAULT_PASSWORD;
    const question = `Shared poll ${Date.now()}?`;

    const authorContext = await browser.newContext();
    const voterContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    const voterPage = await voterContext.newPage();

    try {
      await registerUser(authorPage, author, password);
      await createPollPost(authorPage, {
        question,
        options: ['A', 'B'],
      });

      await registerUser(voterPage, voter, password);
      const poll = pollArticle(voterPage, question);
      await voteSingleChoice(poll, 'B');

      await expectPollVoteCount(poll, 1);
      await expect(poll.getByText('100% (1)')).toBeVisible();
    } finally {
      await authorContext.close();
      await voterContext.close();
    }
  });
});

test.describe('Poll management', () => {
  test('author can close a poll and stop further voting', async ({ page }) => {
    await registerUser(page, uniqueUsername('poll_close'));

    const question = `Close me ${Date.now()}?`;
    await createPollPost(page, {
      question,
      options: ['Open', 'Closed'],
    });

    const poll = pollArticle(page, question);
    page.once('dialog', dialog => dialog.accept());
    await poll.getByRole('button', { name: 'Close poll' }).click();

    await expect(poll.getByText('Closed')).toBeVisible();
    await expect(poll.getByText('Poll closed')).toBeVisible();
    await expect(poll.getByRole('button', { name: 'Close poll' })).not.toBeVisible();
  });

  test('non-author cannot close another user poll', async ({ browser }) => {
    const author = uniqueUsername('poll_close_author');
    const other = uniqueUsername('poll_close_other');
    const password = DEFAULT_PASSWORD;
    const question = `Author only close ${Date.now()}?`;

    const authorContext = await browser.newContext();
    const otherContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    const otherPage = await otherContext.newPage();

    try {
      await registerUser(authorPage, author, password);
      await createPollPost(authorPage, {
        question,
        options: ['One', 'Two'],
      });

      await registerUser(otherPage, other, password);
      const poll = pollArticle(otherPage, question);
      await expect(poll.getByRole('button', { name: 'Close poll' })).not.toBeVisible();

      await voteSingleChoice(poll, 'One');
      await expectPollVoteCount(poll, 1);
    } finally {
      await authorContext.close();
      await otherContext.close();
    }
  });
});
