// Keeps the editor and the preview scrolled to the same place. Headings and code blocks are
// landmarks: the third heading in the Markdown is the third in the preview, so each side lists
// where its landmarks are, and a position is passed across as "this far between landmark i and
// the next". A long code block or diagram then can't throw the two sides out of step.

/** Headings and code fences in the Markdown, in order, with the line each starts on. */
export function markdownLandmarks(text) {
  const landmarks = [];
  let fence = null;
  text.split('\n').forEach((line, index) => {
    const marker = /^(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !line.slice(marker[1].length).trim()) fence = null;
    } else if (marker) {
      fence = marker[1];
      landmarks.push({ kind: 'code', line: index + 1 });
    } else if (/^#{2,6}\s/.test(line)) {
      landmarks.push({ kind: 'heading', line: index + 1 });
    }
  });
  return landmarks;
}

/** How many landmarks the two sides agree on, from the start. */
function agreed(fromMarkdown, fromPreview) {
  let count = 0;
  while (count < fromMarkdown.length && count < fromPreview.length && fromMarkdown[count].kind === fromPreview[count].kind) count++;
  return count;
}

/** One side's stops: the top, each landmark, the end, never going backwards. */
function stops(tops, max) {
  const list = [0];
  for (const top of tops) list.push(Math.min(max, Math.max(list.at(-1), top)));
  list.push(max);
  return list;
}

/** Where `top` falls among the stops, as the stop before it and the fraction of the way on. */
function locate(list, top) {
  let index = 0;
  while (index < list.length - 2 && list[index + 1] <= top) index++;
  const span = list[index + 1] - list[index];
  return { index, fraction: span > 0 ? Math.min(1, Math.max(0, (top - list[index]) / span)) : 0 };
}

const place = (list, { index, fraction }) => list[index] + fraction * (list[index + 1] - list[index]);

/**
 * `editor` and `preview` are the components (refs), `body` returns the Markdown. Call
 * `scrolled(side)` when a side scrolls; it moves the other one. `align(from, to)` moves one
 * side to match the other, and `where`/`go` do the same in two steps, for a phone, where only
 * one side is on screen at a time and each has to be measured while it's showing.
 */
export function scrollSync({ editor, preview, body }) {
  // The scroll position this code last set on each side, so its echo isn't taken for the user's
  const expected = { editor: null, preview: null };
  let frame = 0;

  function measure(side) {
    const fromMarkdown = markdownLandmarks(body());
    const fromPreview = preview.value?.landmarks() ?? [];
    const count = agreed(fromMarkdown, fromPreview);
    const scroller = side === 'editor' ? editor.value?.scroller() : preview.value?.scroller();
    if (!scroller) return null;
    const tops =
      side === 'editor'
        ? fromMarkdown.slice(0, count).map((landmark) => editor.value.lineTop(landmark.line))
        : fromPreview.slice(0, count).map((landmark) => landmark.top);
    return { scroller, list: stops(tops, Math.max(0, scroller.scrollHeight - scroller.clientHeight)) };
  }

  function where(side) {
    const measured = measure(side);
    return measured && locate(measured.list, measured.scroller.scrollTop);
  }

  function go(side, position) {
    const measured = measure(side);
    if (!measured || !position || position.index > measured.list.length - 2) return;
    const top = Math.round(place(measured.list, position));
    if (Math.abs(measured.scroller.scrollTop - top) < 2) return;
    measured.scroller.scrollTop = top;
    expected[side] = measured.scroller.scrollTop;
  }

  const align = (from, to) => go(to, where(from));

  /** Moves the other side to match, if `follow`. True when the scrolling was the user's. */
  function scrolled(side, follow = true) {
    const scroller = side === 'editor' ? editor.value?.scroller() : preview.value?.scroller();
    if (!scroller) return false;
    if (expected[side] !== null) {
      const echo = Math.abs(scroller.scrollTop - expected[side]) < 2;
      expected[side] = null;
      if (echo) return false;
    }
    if (follow) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => align(side, side === 'editor' ? 'preview' : 'editor'));
    }
    return true;
  }

  return { scrolled, align, where, go };
}
