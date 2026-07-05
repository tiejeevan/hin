import { eq, and, inArray, isNull, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { Poll, PollOption, PollResultsVisibility, PollStatus } from '@hin/types';

type Db = DrizzleD1Database<typeof schema>;

export interface PollSettings {
  question: string;
  endsAt?: string | null;
  maxSelections?: number;
  allowVoteChange?: boolean;
  allowVoteRetraction?: boolean;
  isAnonymous?: boolean;
  resultsVisibility?: PollResultsVisibility;
}

export interface PollRow {
  id: number;
  postId: number;
  question: string;
  endsAt: string | null;
  maxSelections: number;
  allowVoteChange: number;
  isAnonymous: number;
  resultsVisibility: string;
  status: string;
  totalVotes: number;
  createdAt: string;
}

export interface OptionRow {
  id: number;
  pollId: number;
  label: string;
  position: number;
  voteCount: number;
  createdAt: string;
  deletedAt: string | null;
}

export function isPollExpired(poll: { endsAt: string | null; status: string }): boolean {
  if (poll.status === 'closed') return true;
  if (!poll.endsAt) return false;
  return new Date(poll.endsAt) <= new Date();
}

export function computeShowResults(
  poll: PollRow,
  userVoteOptionIds: number[],
  viewerId: number | null,
  postAuthorId: number,
): boolean {
  const expired = isPollExpired(poll);
  const effectiveStatus = expired ? 'closed' : poll.status;
  const hasVoted = userVoteOptionIds.length > 0;
  const isAuthor = viewerId !== null && viewerId === postAuthorId;

  switch (poll.resultsVisibility as PollResultsVisibility) {
    case 'always':
      return true;
    case 'after_vote':
      return hasVoted || isAuthor;
    case 'after_close':
      return effectiveStatus === 'closed' || expired || isAuthor;
    default:
      return true;
  }
}

export function buildPollResponse(
  poll: PollRow,
  options: OptionRow[],
  userVoteOptionIds: number[],
  viewerId: number | null,
  postAuthorId: number,
): Poll {
  const expired = isPollExpired(poll);
  const showResults = computeShowResults(poll, userVoteOptionIds, viewerId, postAuthorId);
  const totalVotes = poll.totalVotes;

  const pollOptions: PollOption[] = options
    .filter(o => !o.deletedAt)
    .sort((a, b) => a.position - b.position)
    .map(o => ({
      id: o.id,
      label: o.label,
      position: o.position,
      voteCount: showResults ? o.voteCount : 0,
      votePercent: showResults && totalVotes > 0
        ? Math.round((o.voteCount / totalVotes) * 100)
        : undefined,
    }));

  return {
    id: poll.id,
    postId: poll.postId,
    question: poll.question,
    endsAt: poll.endsAt,
    maxSelections: poll.maxSelections,
    allowVoteChange: poll.allowVoteChange === 1,
    allowVoteRetraction: poll.allowVoteRetraction === 1,
    isAnonymous: poll.isAnonymous === 1,
    resultsVisibility: poll.resultsVisibility as PollResultsVisibility,
    status: (expired ? 'closed' : poll.status) as PollStatus,
    totalVotes: showResults ? totalVotes : 0,
    options: pollOptions,
    userVoteOptionIds: viewerId ? userVoteOptionIds : [],
    showResults,
    isExpired: expired,
  };
}

export async function resolvePollExpiry(db: Db, pollIds: number[]): Promise<void> {
  if (pollIds.length === 0) return;
  const now = new Date().toISOString();
  await db.update(schema.polls)
    .set({ status: 'closed' })
    .where(
      and(
        inArray(schema.polls.id, pollIds),
        eq(schema.polls.status, 'open'),
        sql`${schema.polls.endsAt} IS NOT NULL`,
        sql`${schema.polls.endsAt} <= ${now}`,
      ),
    )
    .run();
}

export async function createPollWithOptions(
  db: Db,
  postId: number,
  settings: PollSettings,
  optionLabels: string[],
): Promise<{ poll: PollRow; options: OptionRow[] }> {
  const maxSelections = settings.maxSelections ?? 1;

  const [poll] = await db.insert(schema.polls).values({
    postId,
    question: settings.question.trim(),
    endsAt: settings.endsAt ?? null,
    maxSelections,
    allowVoteChange: settings.allowVoteChange !== false ? 1 : 0,
    allowVoteRetraction: settings.allowVoteRetraction !== false ? 1 : 0,
    isAnonymous: settings.isAnonymous ? 1 : 0,
    resultsVisibility: settings.resultsVisibility ?? 'always',
    status: 'open',
    totalVotes: 0,
  }).returning();

  const optionRows: OptionRow[] = [];
  for (let i = 0; i < optionLabels.length; i++) {
    const [opt] = await db.insert(schema.pollOptions).values({
      pollId: poll.id,
      label: optionLabels[i].trim(),
      position: i,
      voteCount: 0,
    }).returning();
    optionRows.push(opt as OptionRow);
  }

  return { poll: poll as PollRow, options: optionRows };
}

export async function loadPollsForPosts(
  db: Db,
  postIds: number[],
  postAuthorMap: Map<number, number>,
  currentUserId: number | null,
): Promise<Map<number, Poll>> {
  const result = new Map<number, Poll>();
  if (postIds.length === 0) return result;

  const pollRows = await db.select()
    .from(schema.polls)
    .where(inArray(schema.polls.postId, postIds))
    .all();

  if (pollRows.length === 0) return result;

  const pollIds = pollRows.map(p => p.id);
  await resolvePollExpiry(db, pollIds);

  const refreshedPolls = await db.select()
    .from(schema.polls)
    .where(inArray(schema.polls.postId, postIds))
    .all();

  const allOptions = await db.select()
    .from(schema.pollOptions)
    .where(
      and(
        inArray(schema.pollOptions.pollId, pollIds),
        isNull(schema.pollOptions.deletedAt),
      ),
    )
    .all();

  const optionsByPoll = new Map<number, OptionRow[]>();
  for (const opt of allOptions) {
    const list = optionsByPoll.get(opt.pollId) || [];
    list.push(opt as OptionRow);
    optionsByPoll.set(opt.pollId, list);
  }

  let userVotesByPoll = new Map<number, number[]>();
  if (currentUserId) {
    const userVotes = await db.select({
      pollId: schema.pollVotes.pollId,
      optionId: schema.pollVotes.optionId,
    })
      .from(schema.pollVotes)
      .where(
        and(
          eq(schema.pollVotes.userId, currentUserId),
          inArray(schema.pollVotes.pollId, pollIds),
          isNull(schema.pollVotes.deletedAt),
        ),
      )
      .all();

    for (const v of userVotes) {
      const list = userVotesByPoll.get(v.pollId) || [];
      list.push(v.optionId);
      userVotesByPoll.set(v.pollId, list);
    }
  }

  for (const poll of refreshedPolls) {
    const postAuthorId = postAuthorMap.get(poll.postId) ?? 0;
    const userVoteOptionIds = userVotesByPoll.get(poll.id) || [];
    const options = optionsByPoll.get(poll.id) || [];
    result.set(
      poll.postId,
      buildPollResponse(poll as PollRow, options, userVoteOptionIds, currentUserId, postAuthorId),
    );
  }

  return result;
}

export async function getPollByPostId(
  db: Db,
  postId: number,
  postAuthorId: number,
  currentUserId: number | null,
): Promise<Poll | null> {
  const map = await loadPollsForPosts(db, [postId], new Map([[postId, postAuthorId]]), currentUserId);
  return map.get(postId) ?? null;
}

export async function castVote(
  db: Db,
  postId: number,
  userId: number,
  optionIds: number[],
): Promise<{ poll: Poll; error?: string; status?: number }> {
  const pollRow = await db.select()
    .from(schema.polls)
    .where(eq(schema.polls.postId, postId))
    .get();

  if (!pollRow) return { poll: null as unknown as Poll, error: 'Poll not found', status: 404 };

  await resolvePollExpiry(db, [pollRow.id]);
  const poll = await db.select().from(schema.polls).where(eq(schema.polls.id, pollRow.id)).get();
  if (!poll) return { poll: null as unknown as Poll, error: 'Poll not found', status: 404 };

  if (isPollExpired(poll)) {
    return { poll: null as unknown as Poll, error: 'Poll is closed', status: 403 };
  }

  const uniqueOptionIds = [...new Set(optionIds)];
  if (uniqueOptionIds.length !== optionIds.length) {
    return { poll: null as unknown as Poll, error: 'Duplicate options not allowed', status: 400 };
  }
  if (uniqueOptionIds.length > poll.maxSelections) {
    return { poll: null as unknown as Poll, error: `Maximum ${poll.maxSelections} selection(s) allowed`, status: 400 };
  }
  if (uniqueOptionIds.length === 0) {
    return { poll: null as unknown as Poll, error: 'Select at least one option', status: 400 };
  }

  const validOptions = await db.select()
    .from(schema.pollOptions)
    .where(
      and(
        eq(schema.pollOptions.pollId, poll.id),
        inArray(schema.pollOptions.id, uniqueOptionIds),
        isNull(schema.pollOptions.deletedAt),
      ),
    )
    .all();

  if (validOptions.length !== uniqueOptionIds.length) {
    return { poll: null as unknown as Poll, error: 'Invalid option(s)', status: 400 };
  }

  const existingVotes = await db.select()
    .from(schema.pollVotes)
    .where(
      and(
        eq(schema.pollVotes.userId, userId),
        eq(schema.pollVotes.pollId, poll.id),
        isNull(schema.pollVotes.deletedAt),
      ),
    )
    .all();

  const hasExistingVote = existingVotes.length > 0;
  if (hasExistingVote && poll.allowVoteChange === 0) {
    return { poll: null as unknown as Poll, error: 'Vote changes are not allowed', status: 403 };
  }

  const post = await db.select({ userId: schema.posts.userId })
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .get();

  const now = new Date().toISOString();

  if (hasExistingVote) {
    const oldOptionIds = existingVotes.map(v => v.optionId);
    await db.update(schema.pollVotes)
      .set({ deletedAt: now })
      .where(
        and(
          eq(schema.pollVotes.userId, userId),
          eq(schema.pollVotes.pollId, poll.id),
          isNull(schema.pollVotes.deletedAt),
        ),
      )
      .run();

    for (const optId of oldOptionIds) {
      await db.update(schema.pollOptions)
        .set({ voteCount: sql`MAX(0, ${schema.pollOptions.voteCount} - 1)` })
        .where(eq(schema.pollOptions.id, optId))
        .run();
    }
  }

  for (const optId of uniqueOptionIds) {
    const existing = await db.select()
      .from(schema.pollVotes)
      .where(
        and(
          eq(schema.pollVotes.userId, userId),
          eq(schema.pollVotes.optionId, optId),
        ),
      )
      .get();

    if (existing) {
      await db.update(schema.pollVotes)
        .set({ deletedAt: null, createdAt: now })
        .where(
          and(
            eq(schema.pollVotes.userId, userId),
            eq(schema.pollVotes.optionId, optId),
          ),
        )
        .run();
    } else {
      await db.insert(schema.pollVotes).values({
        userId,
        optionId: optId,
        pollId: poll.id,
      }).run();
    }

    await db.update(schema.pollOptions)
      .set({ voteCount: sql`${schema.pollOptions.voteCount} + 1` })
      .where(eq(schema.pollOptions.id, optId))
      .run();
  }

  if (!hasExistingVote) {
    await db.update(schema.polls)
      .set({ totalVotes: sql`${schema.polls.totalVotes} + 1` })
      .where(eq(schema.polls.id, poll.id))
      .run();
  }

  const updatedPoll = await getPollByPostId(db, postId, post?.userId ?? 0, userId);
  if (!updatedPoll) return { poll: null as unknown as Poll, error: 'Poll not found', status: 404 };

  return { poll: updatedPoll };
}

export async function retractVote(
  db: Db,
  postId: number,
  userId: number,
): Promise<{ poll: Poll; error?: string; status?: number }> {
  const pollRow = await db.select()
    .from(schema.polls)
    .where(eq(schema.polls.postId, postId))
    .get();

  if (!pollRow) return { poll: null as unknown as Poll, error: 'Poll not found', status: 404 };

  if (pollRow.allowVoteRetraction === 0) {
    return { poll: null as unknown as Poll, error: 'Vote removal is not allowed for this poll', status: 403 };
  }

  const existingVotes = await db.select()
    .from(schema.pollVotes)
    .where(
      and(
        eq(schema.pollVotes.userId, userId),
        eq(schema.pollVotes.pollId, pollRow.id),
        isNull(schema.pollVotes.deletedAt),
      ),
    )
    .all();

  if (existingVotes.length === 0) {
    return { poll: null as unknown as Poll, error: 'No vote to retract', status: 400 };
  }

  const now = new Date().toISOString();
  const oldOptionIds = existingVotes.map(v => v.optionId);

  await db.update(schema.pollVotes)
    .set({ deletedAt: now })
    .where(
      and(
        eq(schema.pollVotes.userId, userId),
        eq(schema.pollVotes.pollId, pollRow.id),
        isNull(schema.pollVotes.deletedAt),
      ),
    )
    .run();

  for (const optId of oldOptionIds) {
    await db.update(schema.pollOptions)
      .set({ voteCount: sql`MAX(0, ${schema.pollOptions.voteCount} - 1)` })
      .where(eq(schema.pollOptions.id, optId))
      .run();
  }

  await db.update(schema.polls)
    .set({ totalVotes: sql`MAX(0, ${schema.polls.totalVotes} - 1)` })
    .where(eq(schema.polls.id, pollRow.id))
    .run();

  const post = await db.select({ userId: schema.posts.userId })
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .get();

  const updatedPoll = await getPollByPostId(db, postId, post?.userId ?? 0, userId);
  if (!updatedPoll) return { poll: null as unknown as Poll, error: 'Poll not found', status: 404 };

  return { poll: updatedPoll };
}

export async function closePoll(
  db: Db,
  postId: number,
): Promise<{ poll: Poll; error?: string; status?: number }> {
  const pollRow = await db.select()
    .from(schema.polls)
    .where(eq(schema.polls.postId, postId))
    .get();

  if (!pollRow) return { poll: null as unknown as Poll, error: 'Poll not found', status: 404 };

  if (pollRow.status === 'closed') {
    return { poll: null as unknown as Poll, error: 'Poll is already closed', status: 400 };
  }

  await db.update(schema.polls)
    .set({ status: 'closed' })
    .where(eq(schema.polls.id, pollRow.id))
    .run();

  const post = await db.select({ userId: schema.posts.userId })
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .get();

  const updatedPoll = await getPollByPostId(db, postId, post?.userId ?? 0, null);
  if (!updatedPoll) return { poll: null as unknown as Poll, error: 'Poll not found', status: 404 };

  return { poll: updatedPoll };
}
