// Keeps tour instructions inside the viewport even for full-width targets or short windows.
export function tourCardPosition(target: { left: number; right: number; top: number; bottom: number }, card: { width: number; height: number }, viewport: { width: number; height: number }, side = "bottom") {
  const gap = 16;
  let left = (target.left + target.right - card.width) / 2;
  let top = target.bottom + gap;
  if (side.startsWith("right")) { left = target.right + gap; top = target.top; }
  if (side.startsWith("left")) { left = target.left - card.width - gap; top = target.top; }
  if (side.startsWith("top") || top + card.height > viewport.height - gap) top = target.top - card.height - gap;
  return {
    left: Math.max(gap, Math.min(left, viewport.width - card.width - gap)),
    top: Math.max(gap, Math.min(top, viewport.height - card.height - gap)),
  };
}
