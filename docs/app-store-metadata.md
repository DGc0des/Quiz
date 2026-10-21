# App Store submission sheet

Prepared 2026-09-19 from the code and `app.json` as they are today. Everything here is a draft to
paste into App Store Connect; the decisions marked **You decide** are yours. Keep this file in step
with `app.json` → `ios.privacyManifests`: the App Privacy answers below and that manifest must say
the same thing.

## Identity

| Field | Value | Status |
|---|---|---|
| Bundle ID | `com.dgkrezios.quiz` (iOS and Android) | **You decide.** Chosen during the review fixes to replace the placeholder. It becomes permanent the moment you register it in the Apple Developer portal; change it in `app.json` before that if you want another |
| URL scheme | `quizapp://` | Generic enough that another installed app could claim it too. Universal links (post-v1) remove the ambiguity |
| Devices | iPhone only (`supportsTablet: false`) | Removes the 13" iPad screenshot requirement and iPad review |
| Primary language | Greek | The binary declares only `el` (`CFBundleDevelopmentRegion`, `el.lproj`) |
| Encryption | `ITSAppUsesNonExemptEncryption = false` | Already set; HTTPS only |

## Store listing (Greek) — **You decide** the name

"Quiz" is taken on the App Store. Name ideas, each ≤ 30 characters: «Κουίζ Παρέας», «Κουίζ με Φίλους»,
«Ποιος Ξέρει; Κουίζ». Update `expo.name` in `app.json` if the home-screen name should match.

- **Υπότιτλος (≤ 30):** Παιχνίδι γνώσεων για παρέες
- **Κείμενο προώθησης (≤ 170):** Φτιάξε παιχνίδι, μοιράσου τον κωδικό και παίξτε μαζί από τα κινητά σας. Ερωτήσεις σε 6 κατηγορίες, βοήθειες και ομάδες.
- **Περιγραφή:**

  > Ένα κουίζ γνώσεων για να παίζεις με την παρέα σου, ο καθένας από το κινητό του.
  >
  > • Φτιάξε παιχνίδι και κάλεσε φίλους με κωδικό ή QR.
  > • Πάνω από 1.300 ερωτήσεις σε 6 κατηγορίες: Ιστορία, Γεωγραφία, Επιστήμη, Αθλητισμός, Τέχνες, Ψυχαγωγία.
  > • Ερωτήσεις πολλαπλής επιλογής και «όποιος πλησιάσει περισσότερο κερδίζει».
  > • Βοήθειες: 50/50, Κλέψε, Διπλό, Σαμποτάζ.
  > • Ατομικά ή σε δύο ομάδες με αρχηγό.
  > • Εξάσκηση μόνος σου όταν δεν έχει έρθει ακόμα η παρέα.
  >
  > Χωρίς λογαριασμό, χωρίς διαφημίσεις.

- **Λέξεις-κλειδιά (≤ 100, με κόμμα):** κουίζ,γνώσεις,παρέα,trivia,ερωτήσεις,πολλοί παίκτες,ομάδες,ιστορία,γεωγραφία
- **Support URL:** required. A one-page site with a contact email is enough.
- **Privacy Policy URL:** host `docs/privacy-policy.md` (fill in the email first).

## App Privacy questionnaire

Answer **Yes, we collect data**, then declare exactly these three types. Nothing is used for
tracking, and there are no third-party analytics or advertising SDKs.

| Category → type | Collected | Linked to the user | Tracking | Purpose |
|---|---|---|---|---|
| Contact Info → Name | Yes — the display name typed on Home/Join | Yes | No | App Functionality |
| Identifiers → User ID | Yes — the anonymous Supabase user id | Yes | No | App Functionality |
| User Content → Gameplay Content | Yes — answers, scores, helps used | Yes | No | App Functionality |

Why "linked": the name and gameplay are stored under the anonymous user id. Declaring more than you
collect is never a rejection reason; declaring less is. Not collected: location, contacts, photos
(the camera frame never leaves the device), usage data, diagnostics, advertising data.

## Age rating

Answer "None" to every content descriptor. For user-generated content: players type a display
name (≤ 20 characters) that other players in the same invite-only game can see. Names are filtered
server-side against a profanity list. There is no chat, no free text beyond the name, no public
profile and no unrestricted web access.

## Review notes (English — reviewers read these)

> No account or login is needed; the app signs in anonymously on first launch.
>
> **Testing on one device:** enter any name on the first screen, tap "Δημιουργία Παιχνιδιού"
> (Create Game), then in the lobby tap "🎯 Εξάσκηση μόνος σου" (Practice alone). This plays the
> full game: pick points and a category, answer questions, see results, until the target score
> ends the game.
>
> **Testing multiplayer:** on a second device, tap "Είσοδος σε Παιχνίδι" (Join Game) and type the
> 6-character code shown in the first device's lobby, or scan its QR code. The camera is used only
> for that QR scan and is optional; the code can always be typed.
>
> The interface is in Greek only.

## Screenshots

6.9" iPhone set only (iPad is off). Suggested frames: Home, Lobby with QR code, a question with the
help buttons, a numeric "closest wins" question, the results screen, the winner screen.

## Before you press Submit

- [ ] Bundle ID confirmed and registered; App Store Connect app record created.
- [ ] Store name chosen and available.
- [ ] Privacy policy hosted with the contact email filled in; support URL live.
- [ ] `eas build:configure`, both `EXPO_PUBLIC_*` variables registered for `production`.
- [ ] Supabase plan will not pause the project during review.
- [ ] TestFlight build installed on a clean iPhone and the practice game played end to end.
