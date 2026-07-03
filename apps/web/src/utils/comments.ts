import { Comment } from '@hin/types';
import { CommentNode } from '../types/ui';

export const buildCommentTree = (flatComments: Comment[]): CommentNode[] => {
  const map: Record<number, CommentNode> = {};
  const roots: CommentNode[] = [];

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

  const pruneTree = (nodes: CommentNode[]): CommentNode[] => {
    return nodes.filter(node => {
      node.replies = pruneTree(node.replies);
      const isDeleted = !!node.deletedAt || node.username === 'deleted';
      return !isDeleted || node.replies.length > 0;
    });
  };

  return pruneTree(roots);
};
