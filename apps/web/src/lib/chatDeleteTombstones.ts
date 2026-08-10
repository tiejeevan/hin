/** Immutable add of a deleted-message id into a tombstone set. */
export function addTombstone(set: Set<number>, id: number): Set<number> {
  if (set.has(id)) return set;
  const next = new Set(set);
  next.add(id);
  return next;
}

/** Immutable remove of a deleted-message id from a tombstone set. */
export function removeTombstone(set: Set<number>, id: number): Set<number> {
  if (!set.has(id)) return set;
  const next = new Set(set);
  next.delete(id);
  return next;
}
