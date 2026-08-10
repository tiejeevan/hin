import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createChatHistoryController,
  getChatLayer,
  mergeChatState,
  type ChatHistoryLayer,
} from './chatHistoryLayer';

describe('getChatLayer', () => {
  it('returns null for non-objects', () => {
    expect(getChatLayer(null)).toBeNull();
    expect(getChatLayer(undefined)).toBeNull();
    expect(getChatLayer('list')).toBeNull();
  });

  it('returns list or thread markers', () => {
    expect(getChatLayer({ hinChat: 'list' })).toBe('list');
    expect(getChatLayer({ hinChat: 'thread' })).toBe('thread');
  });

  it('returns null for unknown markers', () => {
    expect(getChatLayer({ hinChat: 'other' })).toBeNull();
    expect(getChatLayer({})).toBeNull();
  });
});

describe('mergeChatState', () => {
  it('merges hinChat onto existing state', () => {
    expect(mergeChatState({ foo: 1 }, 'list')).toEqual({ foo: 1, hinChat: 'list' });
  });

  it('strips hinChat when layer is null', () => {
    expect(mergeChatState({ foo: 1, hinChat: 'thread' }, null)).toEqual({ foo: 1 });
  });

  it('starts from empty object when existing is invalid', () => {
    expect(mergeChatState(null, 'list')).toEqual({ hinChat: 'list' });
    expect(mergeChatState([1], 'thread')).toEqual({ hinChat: 'thread' });
  });
});

function createMockHistory(initialState: unknown = null) {
  let state = initialState;
  const stack: unknown[] = [initialState];
  let index = 0;
  const listeners: Array<(ev: { state: unknown }) => void> = [];

  const history = {
    get state() {
      return state;
    },
    pushState(next: unknown) {
      stack.splice(index + 1);
      stack.push(next);
      index = stack.length - 1;
      state = next;
    },
    replaceState(next: unknown) {
      stack[index] = next;
      state = next;
    },
    go(delta: number) {
      const step = delta < 0 ? -1 : 1;
      const steps = Math.abs(delta);
      // Browsers apply the jump then fire a single popstate for the final entry.
      let nextIndex = index;
      for (let i = 0; i < steps; i++) {
        const candidate = nextIndex + step;
        if (candidate < 0 || candidate >= stack.length) break;
        nextIndex = candidate;
      }
      if (nextIndex === index) return;
      index = nextIndex;
      state = stack[index];
      queueMicrotask(() => {
        for (const l of listeners) l({ state });
      });
    },
  };

  return {
    history,
    onPopState(fn: (ev: { state: unknown }) => void) {
      listeners.push(fn);
    },
    /** Simulate one browser Back (one popstate). */
    back() {
      history.go(-1);
    },
    get stack() {
      return stack;
    },
    get index() {
      return index;
    },
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createChatHistoryController', () => {
  let mock: ReturnType<typeof createMockHistory>;
  let controller: ReturnType<typeof createChatHistoryController>;

  beforeEach(() => {
    mock = createMockHistory({ page: true });
    controller = createChatHistoryController({
      history: mock.history,
      getUrl: () => '/',
    });
    mock.onPopState(ev => {
      if (controller.consumeSuppressedPop()) return;
      void ev;
    });
  });

  it('pushList / pushThread increase depth and set markers', () => {
    controller.pushList();
    expect(controller.getDepth()).toBe(1);
    expect(getChatLayer(mock.history.state)).toBe('list');

    controller.pushThread();
    expect(controller.getDepth()).toBe(2);
    expect(getChatLayer(mock.history.state)).toBe('thread');
  });

  it('is idempotent for pushList / pushThread on same layer', () => {
    controller.pushList();
    controller.pushList();
    expect(controller.getDepth()).toBe(1);

    controller.pushThread();
    controller.pushThread();
    expect(controller.getDepth()).toBe(2);
  });

  it('ensureOpenToThread inserts list under thread when closed', () => {
    controller.ensureOpenToThread();
    expect(controller.getDepth()).toBe(2);
    expect(getChatLayer(mock.history.state)).toBe('thread');
    expect(getChatLayer(mock.stack[mock.index - 1])).toBe('list');
  });

  it('ensureOpenToList is a no-op when already on thread', () => {
    controller.ensureOpenToThread();
    controller.ensureOpenToList();
    expect(controller.getDepth()).toBe(2);
    expect(getChatLayer(mock.history.state)).toBe('thread');
  });

  it('notePopped and resetDepth track session depth', () => {
    controller.pushList();
    controller.pushThread();
    controller.notePopped();
    expect(controller.getDepth()).toBe(1);
    controller.resetDepth();
    expect(controller.getDepth()).toBe(0);
  });

  it('replaceLayer tags current entry without increasing depth', () => {
    controller.replaceLayer('thread' as ChatHistoryLayer);
    expect(controller.getDepth()).toBe(0);
    expect(getChatLayer(mock.history.state)).toBe('thread');
  });

  it('dismiss with depth 0 strips marker via replaceState', () => {
    controller.replaceLayer('list');
    const settled = vi.fn();
    const went = controller.dismiss({ onSettled: settled });
    expect(went).toBe(false);
    expect(getChatLayer(mock.history.state)).toBeNull();
    expect(settled).toHaveBeenCalledOnce();
  });

  it('dismiss with depth goes back and suppresses pops until settled', async () => {
    controller.ensureOpenToThread();
    expect(controller.getDepth()).toBe(2);

    const settled = vi.fn();
    const went = controller.dismiss({ onSettled: settled });
    expect(went).toBe(true);
    expect(controller.isSuppressing()).toBe(true);
    expect(settled).not.toHaveBeenCalled();

    await flushMicrotasks();
    expect(settled).toHaveBeenCalledOnce();
    expect(controller.getDepth()).toBe(0);
    expect(controller.isSuppressing()).toBe(false);
    expect(getChatLayer(mock.history.state)).toBeNull();
  });

  it('dismiss chains onSettled when already suppressing', async () => {
    controller.pushList();
    controller.pushThread();
    const first = vi.fn();
    const second = vi.fn();
    controller.dismiss({ onSettled: first });
    controller.dismiss({ onSettled: second });
    await flushMicrotasks();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('two-step back: thread → list → closed depth', async () => {
    controller.ensureOpenToList();
    controller.ensureOpenToThread();
    expect(controller.getDepth()).toBe(2);

    mock.back();
    await flushMicrotasks();
    expect(getChatLayer(mock.history.state)).toBe('list');
    controller.notePopped();
    expect(controller.getDepth()).toBe(1);

    mock.back();
    await flushMicrotasks();
    expect(getChatLayer(mock.history.state)).toBeNull();
    controller.resetDepth();
    expect(controller.getDepth()).toBe(0);
  });

  it('startChat-style open keeps list under thread', () => {
    controller.ensureOpenToThread();
    expect(controller.getDepth()).toBe(2);
    expect(getChatLayer(mock.stack[mock.index - 1])).toBe('list');
    expect(getChatLayer(mock.history.state)).toBe('thread');
  });

  it('X close dismiss removes all chat layers without leaving markers', async () => {
    controller.ensureOpenToThread();
    const settled = vi.fn();
    controller.dismiss({ onSettled: settled });
    await flushMicrotasks();
    expect(settled).toHaveBeenCalledOnce();
    expect(getChatLayer(mock.history.state)).toBeNull();
    expect(controller.getDepth()).toBe(0);

    // Further back should not re-enter a chat marker
    mock.back();
    await flushMicrotasks();
    expect(getChatLayer(mock.history.state)).toBeNull();
  });
});
