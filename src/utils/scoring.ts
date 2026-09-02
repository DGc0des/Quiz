/**
 * What is left of client-side scoring after Stage 3.
 *
 * The rules themselves — steal resolution, "closest wins", the 50/50 cap, Double,
 * and the winner tie-break — now live server-side in `resolve_round` and
 * `close_review` (`supabase/migrations/0006_authoritative_scoring.sql`), because
 * deciding whether an answer was right needs the answer key, and the answer key
 * is no longer shipped in the app.
 *
 * `resolveAnswers`, `markClosest`, `resolveForScoring`, `earnedForPlayer` and
 * `pickWinner` were deleted rather than kept as a second implementation: two
 * copies of the same rules are free to drift, which is exactly how §4.3 M3
 * happened. `ResultScreen` reads the outcome the server wrote into
 * `Turn.resolved` instead of recomputing it.
 *
 * Only the target-score constants remain, because the lobby picker and the
 * result display need them on the client.
 */

/** First player to reach or exceed this after a round wins. */
export const WIN_SCORE = 15;

/** Selectable target scores the host can choose in the lobby. */
export const WIN_SCORE_OPTIONS = [10, 15, 21] as const;
