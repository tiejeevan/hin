import { expect, type Locator, type Page } from '@playwright/test';

export interface PollDraftInput {
  question: string;
  options: string[];
  postContent?: string;
  multiChoice?: boolean;
  maxSelections?: number;
  resultsVisibility?: 'Always show results' | 'Show after I vote' | 'Show when poll closes';
  allowVoteChange?: boolean;
  allowVoteRetraction?: boolean;
}

export async function openCreatePostForm(page: Page) {
  const fab = page.locator('[aria-label="Create post"]');
  const desktopButton = page.getByRole('button', { name: 'Create Post', exact: true });
  if (await desktopButton.isVisible()) {
    await desktopButton.click();
  } else {
    await fab.click();
  }
  await expect(page.getByPlaceholder('What is on your mind?')).toBeVisible();
}

export async function enablePollOnCreateForm(page: Page) {
  await page.getByRole('button', { name: 'Post options' }).click();
  await page.getByRole('menuitem', { name: 'Add Poll' }).click();
  await expect(page.getByText('Poll', { exact: true })).toBeVisible();
}

export async function fillPollDraft(page: Page, draft: PollDraftInput) {
  if (draft.postContent) {
    await page.getByPlaceholder('What is on your mind?').fill(draft.postContent);
  }

  await page
    .getByPlaceholder('Ask a question or write a statement…')
    .fill(draft.question);

  for (let i = 0; i < draft.options.length; i++) {
    await page.getByPlaceholder(`Option ${i + 1}`).fill(draft.options[i]);
    if (i >= 1 && i < draft.options.length - 1) {
      const nextIndex = i + 2;
      const nextPlaceholder = `Option ${nextIndex}`;
      const hasNext = await page.getByPlaceholder(nextPlaceholder).count();
      if (!hasNext) {
        await page.getByRole('button', { name: 'Add option' }).click();
      }
    }
  }

  const needsSettings =
    draft.multiChoice ||
    draft.resultsVisibility ||
    draft.allowVoteChange === false ||
    draft.allowVoteRetraction === false;

  if (needsSettings) {
    await page.getByRole('button', { name: 'Poll settings' }).click();

    if (draft.multiChoice) {
      await page.getByRole('button', { name: 'Multiple choice' }).click();
      if (draft.maxSelections && draft.maxSelections > 2) {
        await page.locator('input[type="number"]').fill(String(draft.maxSelections));
      }
    }

    if (draft.resultsVisibility) {
      await page.getByLabel(draft.resultsVisibility).check();
    }

    if (draft.allowVoteChange === false) {
      await page.getByLabel('Allow changing vote').uncheck();
    }

    if (draft.allowVoteRetraction === false) {
      await page.getByLabel('Allow removing vote').uncheck();
    }
  }
}

export async function publishPost(page: Page) {
  await page.getByRole('button', { name: 'Publish post' }).click();
  await expect(page.getByPlaceholder('What is on your mind?')).not.toBeVisible();
}

export async function createPollPost(page: Page, draft: PollDraftInput) {
  await openCreatePostForm(page);
  await enablePollOnCreateForm(page);
  await fillPollDraft(page, draft);
  await publishPost(page);
}

export function pollArticle(page: Page, question: string): Locator {
  return page.locator('article').filter({ hasText: question });
}

export async function voteSingleChoice(poll: Locator, optionLabel: string) {
  await poll.getByRole('button', { name: optionLabel }).click();
}

export async function voteMultiChoice(poll: Locator, optionLabels: string[]) {
  for (const label of optionLabels) {
    await poll.getByRole('button', { name: label }).click();
  }
  await poll.getByRole('button', { name: 'Vote', exact: true }).click();
}

export async function expectPollResultsHidden(poll: Locator) {
  await expect(poll.getByText('Results hidden')).toBeVisible();
}

export async function expectPollVoteCount(poll: Locator, count: number) {
  const label = count === 1 ? '1 vote' : `${count} votes`;
  await expect(poll.getByText(label)).toBeVisible();
}
