// What Keith changed in a post's notes for the AI since a run last read them: the lines that are
// new or edited, in his order. A revision sends only these, so something he asked for before the
// draft isn't applied all over again. Deleted lines don't go: a note he's done with may simply
// have been handled. Shared by the admin's editor and its API.

const lines = (text) => (text ?? '').split('\n').map((line) => line.trim()).filter(Boolean);

/** Lines in `notes` that aren't in `seen`, the notes as the last Generate or Revise read them. */
export function changedNotes(seen, notes) {
  const before = new Set(lines(seen));
  return [...new Set(lines(notes).filter((line) => !before.has(line)))];
}
