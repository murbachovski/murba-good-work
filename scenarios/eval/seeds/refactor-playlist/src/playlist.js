let tracks = [];

export function addTrack(title, seconds) {
  if (tracks.some((t) => t.title === title)) return false;
  tracks.push({ title, seconds });
  return true;
}

export function removeTrack(title) {
  const i = tracks.findIndex((t) => t.title === title);
  if (i < 0) return false;
  tracks.splice(i, 1);
  return true;
}

export function totalDuration() {
  return tracks.reduce((sum, t) => sum + t.seconds, 0);
}

export function list() {
  return tracks.map((t) => ({ ...t }));
}

export function clear() {
  tracks = [];
}
