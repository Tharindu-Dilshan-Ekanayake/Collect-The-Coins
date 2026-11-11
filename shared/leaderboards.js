/**
 * Boxity leaderboards, declared once by the client (Legion.SDK.leaderboard.define, which
 * also shows the trophy button) and by the server in its score reports. The server
 * submits every score from state it owns; the client never submits.
 *
 * Ids are permanent: once a board exists, changing its settings here does nothing
 * (edit it in the Boxity dashboard instead).
 */
export const BOARDS = [
  { id: 'coins', label: 'Most Gold', order: 'desc', mode: 'sum', format: 'compact', reset: 'weekly' },
  { id: 'runs', label: 'Most Runs', order: 'desc', mode: 'sum', format: 'number', reset: 'none' },
  { id: 'clear_keep', label: 'Fastest Clear: Gilded Keep', order: 'asc', mode: 'best', format: 'time', reset: 'none' },
  { id: 'clear_frost', label: 'Fastest Clear: Frostfang Vault', order: 'asc', mode: 'best', format: 'time', reset: 'none' },
  { id: 'clear_grotto', label: 'Fastest Clear: Emerald Grotto', order: 'asc', mode: 'best', format: 'time', reset: 'none' },
]
