# Legal documents — status and open items

Two documents live here:

- [`privacy-policy.md`](./privacy-policy.md)
- [`terms-of-use.md`](./terms-of-use.md)

Both were rewritten on **August 3, 2026** against the current codebase
(ISBNdb, shelf scan, Goodreads import, community sharing, moderation). They are
written to be publishable as-is, but the items below are decisions or actions
only you can take. **None of them blocks App Store submission except where
marked.**

> These documents were drafted by reading the code, not by a lawyer. They are
> thorough and follow current practice for a UGC app of this size, but if the
> App starts making meaningful money, have a solicitor/attorney review them.

---

## 1. Assumptions baked in — confirm or change

| Assumption | Where | Change it if wrong |
|---|---|---|
| **Governing law: State of New York, USA** | Terms § 20.1 | Replace both mentions in § 20.1. If you move outside the US, also delete § 19 entirely (arbitration is a US construct) and drop the "United States only" framing. |
| **US-style arbitration + class action waiver, with a 30-day opt-out** | Terms § 19 | The opt-out and small-claims carve-out are what make it enforceable — don't remove them to "strengthen" the clause. Delete the whole section if you'd rather not have arbitration. |
| **You operate as an individual, not a company** | Both docs, headers + Privacy § 1 | If you incorporate, replace "Matthew Zimmerman, an individual developer" with the legal entity name and add its registered address — GDPR Art. 13 requires the controller's identity and contact details. Incorporating is also the single biggest liability improvement available to you. |
| **Apple App Store is the only store today** | Terms § 12 | § 12 already has a fallback sentence for other stores. Before a Google Play release, expand it with Play's billing/refund terms. |
| **Liability cap: greater of amounts paid in 12 months or US$25** | Terms § 16(b) | Was US$10. Raising it slightly makes the clause more likely to survive an unconscionability challenge. |

## 2. Actions before or shortly after launch

- [ ] **Host both documents** and update `constants/legal.ts`. `PRIVACY_POLICY`
      currently points at a URL that must be live before review — a broken link
      is a guaranteed rejection. `TERMS_OF_USE` currently points at Apple's
      standard EULA; switch it to your hosted Terms once published.
      **(Blocks submission.)**
- [ ] **Add both links to the RevenueCat paywall footer** (Guideline 3.1.2) and
      paste the Terms URL into the App Store Connect description field.
      **(Blocks submission.)**
- [ ] **Match the App Privacy questionnaire to the policy.** Based on the
      current code the accurate answers are: *Identifiers* (account ID),
      *User Content* (photos, book data, reviews), *Purchases* (via
      RevenueCat), *Diagnostics*/*Usage* — none, and **no** tracking, so no ATT
      prompt. Do not declare data types the App does not collect.
- [ ] **Register a DMCA agent** with the U.S. Copyright Office
      (<https://dmca.copyright.gov>, ~$6, renewable every 3 years). Terms § 10
      describes a notice-and-takedown process, but **statutory safe harbour
      under 17 U.S.C. § 512 requires a registered agent.** Without it you have
      the process but not the immunity. Cheap and worth doing.
- [ ] **Watch report volume.** Terms § 8 promises action on reports within
      24 hours, which is also what Apple expects under Guideline 1.2. Check the
      `content_reports` table on a schedule you can actually sustain — a
      promise you miss is worse than a longer promise you keep.

## 3. Things to revisit as the App grows

- **GDPR Article 27 EU representative.** Privacy § 12 relies on the Art. 27(2)
  derogation (occasional, low-risk processing). That position is defensible for
  a small app now. If EU usage becomes substantial or regular, you must appoint
  an EU representative (services cost roughly €200–500/year) and add their
  details to the policy.
- **DSA obligations.** Terms § 9 relies on the Art. 19 micro/small-enterprise
  exemption from the formal complaint-handling system and transparency
  reporting. That exemption disappears if you stop being a small enterprise.
- **Google Fonts on web.** `app/_layout.tsx` loads fonts from
  `fonts.googleapis.com` on the web target only, which discloses visitors' IP
  addresses to Google — a documented GDPR sore point in Germany. Disclosed in
  Privacy § 6. If you ever ship the web build to EU users, self-host those two
  fonts instead; the native apps bundle them locally and are unaffected.
- **EXIF metadata.** Privacy § 4 currently has to say we do *not* deliberately
  strip EXIF from uploaded photos, because the code doesn't. Photos can carry
  GPS coordinates, and spine photos are shared to the community by default — so
  a user's home location can leak through a shelf photo. Stripping EXIF on
  upload (`expo-image-manipulator` re-encodes and drops it) would let that
  paragraph become a much stronger promise, and closes a real data-minimisation
  gap under GDPR Art. 5(1)(c). Worth doing; it is a code change, not a legal
  one.
- **Log retention.** Privacy § 10 states server logs are kept "typically no
  more than 30 days". Confirm this matches your Supabase plan's actual log
  retention, and adjust the number if not.
- **Backup retention.** Same section states "typically up to 30 days" for
  backups. Confirm against your Supabase plan.

## 4. If you change the App, change these

The documents make specific factual claims. These are the ones that break
first:

| If you… | Update |
|---|---|
| Add analytics, crash reporting, or ads | Privacy "At a glance", § 3.3, § 6 — the "no analytics, no ads, no tracking" claims become false, and you may need an ATT prompt |
| Change community sharing defaults | Privacy § 5.1, Terms § 6.5 |
| Add email/password or social sign-in | Privacy § 2 and § 3.3 — the whole "anonymous" framing changes, and you gain identity-verification duties for data-subject requests |
| Swap ISBNdb or Vision for another provider | Privacy § 6, Terms § 13 |
| Add push notifications | Privacy § 3, § 4 — new permission and new data |
| Import more than title/author from Goodreads | Privacy § 7 — currently promises only two columns are read |
| Start automated content moderation | Terms § 9 — currently states decisions are human-made |
