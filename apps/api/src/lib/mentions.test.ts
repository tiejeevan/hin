import { describe, it, expect } from 'vitest';
import { parseMentions } from './mentions';

describe('parseMentions', () => {
  it('extracts valid mentions from content', () => {
    const text = 'Hello @alice and @bob_123, check this out!';
    expect(parseMentions(text)).toEqual(['alice', 'bob_123']);
  });

  it('deduplicates repetitive mentions', () => {
    const text = 'Hey @alice, did you see @alice?';
    expect(parseMentions(text)).toEqual(['alice']);
  });

  it('ignores usernames shorter than 3 chars or longer than 30 chars', () => {
    const text = 'Hey @ab and @this_is_a_very_long_username_that_exceeds_thirty_characters_limit';
    expect(parseMentions(text)).toEqual([]);
  });

  it('returns empty array when no mentions are present', () => {
    expect(parseMentions('Hello world!')).toEqual([]);
  });
});
