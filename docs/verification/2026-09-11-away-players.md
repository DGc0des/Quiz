# Away-player verification — 2026-09-11

## Scope and result
Verified deployed server behavior on the Quiz Supabase project and selected local client logic. Physical-phone play, actual iOS suspension latency, unreliable Wi-Fi behavior, and total writes during real matches remain unverified. Xcode device discovery completed successfully and reported “No devices found.” No application behavior was changed.

## Executed checks
- Existing supabase/tests/away_players.sql: 11 checks passed; zero synthetic games and presence rows remained.
- A 2v2 adaptation of that suite: 11 checks passed; asserted four team-game members. Removed the extra advice-only teammate case from the original 3v3 fixture. Confirmed stand-in scoring when a leader has not answered, and original-leader scoring when they answered before going away. Zero synthetic games and presence rows remained.
- Selected Jest suites (presence, gameReconnect, teams): 35 tests passed across 3 suites. These are logic tests, not rendered UI or device tests.
- Read deployed touch_presence, away_after_ms and tick_game: five-second write throttle and 20-second away threshold confirmed.

## Controlled database write measurement
Executed real public.tick_game calls with four synthetic member identities in an idle lobby. Twenty rounds of polling were scheduled at t=0,3,...,57 seconds, representing the calls in a 60-second window. The last batch completed at 57.007689 seconds.
- 80 tick calls.
- 40 actual presence row mutations: 4 initial inserts and 36 updates.
- Game version delta: 0.
- Zero synthetic games or presence rows remained after rollback.

Calls ran serially inside one database transaction; fixture setup was excluded from the count. Compared stored last_seen_ms before and after each tick. This measures logical presence row mutations, not disk I/O, WAL bytes, committed-transaction overhead, HTTP latency, or concurrent throughput. Fixtures and all measurement writes were rolled back. No mobile clients or Realtime-triggered refreshes participated.

Conclusion: 40 presence mutations per minute is supported for the steady three-second polling baseline. It is not a measurement of a real match or all database writes. Additional refreshes can move writes closer to the five-second throttle limit (approximately 48 per minute for four continuously connected players over sustained traffic). Answers, phase changes, and public game projection writes are additional. Successful no-op ticks still perform database work.

## iOS timing
Apple documents suspension shortly after background handling returns, not a universal exact suspension delay:
https://developer.apple.com/documentation/uikit/extending-your-app-s-background-execution-time

The app's interval checks AppState.currentState and stops initiating periodic polls outside the active state. However, Realtime UPDATE and subscription callbacks invoke refreshGame without a foreground guard, and requests already in flight may complete. Therefore OS suspension is not the only determinant of the last stored heartbeat.

The server marks away 20 seconds after the stored heartbeat (subject to join/game grace). Heartbeat throttling means that timestamp can predate the last successful check-in. Observers see the result on a subsequent successful tick, normally up to another polling interval under healthy conditions. No fixed “20 seconds after backgrounding” guarantee has been verified.

## Remaining physical-device evidence
Use four distinct player sessions on the current release build, including an iPhone without an attached debugger. Record build, device, OS, network, action time, last stored heartbeat, first away badge time on an observer, transition/score result, and return time.
- Airplane mode mid-question: correct remaining-player completion and absent-player result.
- Airplane mode during a pick: next present picker; no stuck turn.
- Host away during review and first reveal: acting-host UI and successful advancement.
- 2v2 leader away before and after answering: correct decider and scoring.
- Background for 30 seconds and return: actual timing and cleared away state.
- Repeated Wi-Fi interruption: false-away frequency, recovery, duplicate submissions, and state consistency.

Keep PROJECT_STATUS.md §2.6 device boxes unchecked until those observations exist.

