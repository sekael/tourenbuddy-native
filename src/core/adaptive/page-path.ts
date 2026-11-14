/**
 * A sheet's page path after opening `value`: back to it when it is open already (a page shows
 * once, as a segment's outing reached again from the segment), else pushed on top.
 */
export function opened(path: string[], value: string): string[] {
  const at = path.indexOf(value);
  return at === -1 ? [...path, value] : path.slice(0, at + 1);
}
