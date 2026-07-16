import { Comment, ItemComment } from '@hin/types';
import { CommentNode, ItemCommentNode } from '../types/ui';

function buildTree<TComment extends { id: number; parentId: number | null; deletedAt?: string | null; username: string }>(
  flatComments: TComment[],
): Array<TComment & { replies: Array<TComment & { replies: unknown[] }> }> {
  type Node = TComment & { replies: Node[] };
  const map: Record<number, Node> = {};
  const roots: Node[] = [];

  flatComments.forEach(comment => {
    map[comment.id] = { ...comment, replies: [] };
  });

  flatComments.forEach(comment => {
    const node = map[comment.id];
    if (comment.parentId) {
      const parent = map[comment.parentId];
      if (parent) {
        parent.replies.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  const pruneTree = (nodes: Node[]): Node[] => {
    return nodes.filter(node => {
      node.replies = pruneTree(node.replies);
      const isDeleted = !!node.deletedAt || node.username === 'deleted';
      return !isDeleted || node.replies.length > 0;
    });
  };

  return pruneTree(roots);
}

export const buildCommentTree = (flatComments: Comment[]): CommentNode[] =>
  buildTree(flatComments) as CommentNode[];

export const buildItemCommentTree = (flatComments: ItemComment[]): ItemCommentNode[] =>
  buildTree(flatComments) as ItemCommentNode[];
