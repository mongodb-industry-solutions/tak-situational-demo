// Keep only docs whose identity/author is in the allowlist.
// `callsigns` null/undefined/empty → NO filtering (returns the array unchanged), so the
// normal command-center pages are unaffected. Matches a doc on any of:
//   c   (name / callsign)        e  (author callsign)
//   _id (CoT UID — track key)    d  (author UID)
// A single allowlist therefore filters tracks, chat, markers, alerts and files correctly:
// e.g. ["ALPHA","BRAVO","COMMAND","COMMAND-VEHICLE"] shows only those devices' data
// (tracks naturally exclude COMMAND* since the command vehicle has no track).
export function filterByCallsign(docs, callsigns) {
  const arr = Array.isArray(docs) ? docs : [];
  if (!callsigns || callsigns.length === 0) return arr;
  const allow = callsigns instanceof Set ? callsigns : new Set(callsigns);
  return arr.filter(
    (d) => allow.has(d?.c) || allow.has(d?.e) || allow.has(d?._id) || allow.has(d?.d)
  );
}
