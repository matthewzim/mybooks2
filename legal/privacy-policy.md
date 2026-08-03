# Privacy Policy — TinyShelves

**Effective date:** August 3, 2026
**Last updated:** August 3, 2026
**Controller / Developer:** Matthew Zimmerman, an individual developer trading
as "TinyShelves" ("we," "us," "our," or "the developer")
**Contact:** matthew.zimmerman7@gmail.com

This Privacy Policy explains what information the TinyShelves mobile app
("the App") collects, why, on what legal basis, who it is shared with, and
what rights you have. It applies to all users everywhere, with additional
region-specific terms in Sections 12–15.

---

## At a glance

| | |
|---|---|
| **Do we ask for your name, email, or phone number?** | No. Never. There is no sign-up form. |
| **Do we show ads?** | No. |
| **Do we use analytics or tracking SDKs?** | No. No third-party analytics, advertising, attribution, or tracking software is in the App. |
| **Do we track you across other apps or websites?** | No. The App does not use the Advertising Identifier (IDFA) and never presents an App Tracking Transparency prompt. |
| **Do we sell or "share" your data?** | No — not for money, and not for cross-context behavioural advertising. |
| **Can you delete everything?** | Yes, from inside the App, immediately, with no waiting period. See Section 11. |
| **Is anything you upload public?** | **Sometimes, by default.** Book spine photos you scan are shared to the community library unless you turn that off. Read Section 5 — this is the most important section in this policy. |

---

## 1. Who we are and how to reach us

TinyShelves is built and operated by Matthew Zimmerman as an individual
developer. For the purposes of the EU and UK General Data Protection
Regulation ("GDPR"), the developer is the **data controller** for the
personal data described in this policy.

**Contact for all privacy matters, including data-subject requests:**
matthew.zimmerman7@gmail.com

We are a one-person operation and are not required to appoint a Data
Protection Officer under GDPR Article 37. Privacy requests are handled by the
developer personally.

## 2. "Anonymous" accounts — what that does and does not mean

When you first open the App, it creates an account for you automatically. We
do **not** collect your name, email address, phone number, date of birth,
postal address, or any other directly identifying information, and there is no
password. Your account is identified only by a randomly generated identifier
(a UUID), and the App assigns you a randomly generated display name and public
username, both of which you can change in Settings.

We describe these accounts as "anonymous" because **we genuinely cannot tell
who you are**. We have no realistic means of connecting your account to your
real-world identity.

We want to be precise about the legal characterisation, however: under the
GDPR, data tied to a persistent identifier is **pseudonymous**, not anonymous,
and remains personal data even though we cannot name you. We therefore treat
everything described in this policy as personal data and apply the full
protections of the GDPR to it. Content you choose to write or upload — a
review, an avatar, a photo of your shelf — may also identify you if you choose
to put identifying information in it. Please don't, if you'd rather stay
unidentifiable.

**Practical consequence:** because there is no email or password on your
account, we cannot restore access to it. If you delete the App without first
using the in-app Account Deletion option, or lose your device, your account
and its contents may be permanently unrecoverable. Signing out or resetting
your session creates a *new* account rather than returning you to the old one.

## 3. What information we collect and store

### 3.1 Information you provide or create in the App

Stored on our backend (hosted by Supabase — see Section 6) and linked to your
random account identifier:

- **Profile data:** your display name, your public username, and an optional
  avatar image.
- **Library data:** the bookshelves you create (name, description, colour,
  shelf style, whether the shelf is public, ordering), and the books on them
  (title, author, ISBN, position, whether the book is stacked).
- **Your reviews and ratings:** free-text reviews and 1–5 star ratings you
  write about books. These are your own words — please treat them as
  potentially visible if the shelf they sit on is public.
- **Images you upload:** photographs of book spines, book covers, and your
  avatar image.
- **Subscription status:** a true/false flag recording whether your account
  currently has an active premium entitlement (see Section 8).
- **Moderation data:** reports you file about other users' content (the
  reason you selected, the account and shelf reported, and the time), and the
  list of accounts you have blocked.

### 3.2 Information generated automatically

- **Technical and log data.** Like any internet service, our backend and its
  infrastructure providers automatically record technical information when the
  App connects: IP address, timestamps, the requests made, and general
  device/software information sent by your device. IP addresses are personal
  data under the GDPR, and we disclose them here for that reason. This
  information is used only to operate, secure, debug, and rate-limit the
  service; it is not combined with your library data to profile you, and it is
  retained only for a short period (see Section 10).
- **Authentication tokens.** A session token issued to your device so you stay
  signed in.

### 3.3 Information we do **not** collect

We do not collect or store: your name, email address, phone number, postal
address, date of birth, precise or approximate geolocation, contacts, health
data, biometric data, browsing history, or any payment card or bank details.
We do not access your microphone. We do not read your photo library beyond the
specific images you pick. We do not use cookies for tracking (the App is not a
website), and we do not fingerprint your device.

## 4. Camera, photos, and files

The App asks for the following device permissions. Each is requested only when
you first use the feature it belongs to, and each can be revoked at any time in
your device settings — the App will continue to work without them, minus the
relevant feature.

- **Camera** — to photograph a single book spine ("Scan Spine") or a whole
  bookshelf ("Shelf Scan"). The camera is only active while you are on those
  screens.
- **Photo library** — to let you pick an existing image to use as a spine,
  cover, or avatar. The App receives **only the images you explicitly select**.
  It does not enumerate, scan, index, or upload your photo library, and it does
  not run in the background.
- **Files** — only when you use the Goodreads import feature, and only for the
  single `.csv` file you choose (see Section 7).

Photographs may carry embedded metadata (EXIF), which can include the time the
photo was taken and, if you have location tagging enabled on your camera, GPS
coordinates. The App does not read, use, or store this metadata, and does not
derive your location from it. Images are often re-encoded during cropping or
resizing, which typically discards it — but **we do not strip EXIF as a
deliberate step, and cannot guarantee it has been removed** from an image you
upload or send for text recognition. If you are concerned about location data
in photographs, disable location tagging in your camera settings before taking
them.

## 5. Community features and public visibility — please read this

Some content you create can become visible to other users of the App. This is
the part of the App with the greatest privacy impact, so we set it out in full.

### 5.1 Book spine photos are shared to the community library **by default**

When you scan a book spine using "Scan Spine", the resulting photograph is
added to the shared community library **by default**, so that other users can
find it and use it on their own shelves. When you add a book manually, a
"share with community" switch is shown and is **on by default**; you can turn
it off before saving.

**This is independent of whether your bookshelf is private.** A spine photo you
share can be seen and re-used by other users even if every shelf you own is
private. What is shared is the book record and its spine image — not your
shelf, your reviews, or your ratings.

If you do not want a spine photograph shared, turn the "share with community"
switch off when adding the book, or delete the book afterwards.

### 5.2 Public bookshelves

Bookshelves are **private by default**. If you switch a shelf to public, then
its name, description, appearance, the books on it, their spine and cover
images, **and your display name and public username** become visible to other
users in the community section. Reviews and ratings you have written are
associated with the books on that shelf.

You can make a shelf private again at any time. Doing so removes it from
community surfaces going forward, but does not retract copies or spine images
that other users have already added to their own shelves (see Section 5.4).

### 5.3 Your public profile

Other users can search for accounts by display name or public username and can
open a profile page showing that account's display name, public username,
avatar, and public shelves. You can change your display name and public
username, or remove your public username entirely, in Settings.

### 5.4 Shared content survives your deletion — an important limit on erasure

Book records and spine images in the App are **shared objects**. When another
user adds a community book to their shelf, their shelf points at the same
underlying record and image.

Because of that, when you reset your data or delete your account, book records
and spine images that another user's shelf currently depends on are **retained**
rather than deleted, and are no longer associated with your account. If they
were deleted, other people's shelves would be silently emptied or left with
blank spines. Everything else — your account, profile, shelves, reviews,
ratings, avatar, and every image no other user depends on — is deleted.

We consider this necessary for the rights and freedoms of other users and for
the integrity of the service. If you have a specific concern about a particular
image that has been retained this way, contact us and we will review it
individually — in particular, we will remove any retained image that identifies
you or that you have a legal right to have erased.

### 5.5 Image URLs

Images are stored in our Supabase storage buckets and served over HTTPS. Some
image URLs are unguessable but are not individually access-controlled, which
means **anyone who obtains the URL of an image can view it**. Please do not
upload images containing anything you would not want seen by someone outside
the App.

## 6. Third parties who process data for us

We keep the number of external services to a minimum. Each receives only what
it needs to do its job. None of them is permitted to use your data for their
own advertising or to sell it.

| Service | What it receives | Purpose | Where |
|---|---|---|---|
| **Supabase** | Everything in Section 3.1 and 3.2 — account, library, images, logs, IP address | Database, authentication, file storage, hosting | See Section 9 |
| **Apple** (App Store / In-App Purchase) | Your purchase transaction; your Apple ID and payment details are handled by Apple and **never disclosed to us** | Processing and billing subscriptions | Per Apple's policy |
| **RevenueCat** | Your random account identifier, purchase and receipt data from Apple, device and platform information, and IP address (from which an approximate country may be derived) | Managing and validating subscription entitlements | United States |
| **ISBNdb** | The text of your book search (title, author, and/or ISBN) and lookup requests | Retrieving book metadata and cover images | United States |
| **Google Cloud Vision API** | The book spine or bookshelf photograph you chose to have read, sent as a one-time recognition request | Optical character recognition to auto-fill titles and authors | See Google's terms |

Notes on two of these:

- **Google Cloud Vision.** This is used only when you actively use "Scan Spine"
  auto-fill or "Shelf Scan". The image is sent as the content of a single,
  one-time text-recognition request — whole-bookshelf photos are downscaled
  first; single-spine images are sent as captured. We do not store the image
  with Google, and Google Cloud's terms do not permit customer content
  submitted to the Vision API to be used to train its general models. If you
  never use those features, no image is ever sent to Google.
- **ISBNdb.** Only your search text is sent. Your account identifier, library,
  reviews and images are not sent to ISBNdb. Cover images retrieved from
  ISBNdb are cached in our own storage so the App does not have to request them
  repeatedly.

We may also disclose information where we are legally required to — for example
in response to a valid court order, subpoena, or lawful request from a public
authority — or where necessary to establish, exercise, or defend legal claims,
or to protect the rights, property, or safety of users or the public. Given the
anonymous design of the App, we usually have very little to disclose.

If the App is ever transferred to another owner (a sale, merger, or similar),
your information may transfer with it; you will be notified in the App or
through an updated policy before your data becomes subject to a different
privacy policy.

**Web version.** If a browser-based version of the App is made available, it
loads typefaces from Google Fonts, which causes your browser to contact
Google's servers and discloses your IP address to Google. This does not apply
to the iOS or Android apps, which bundle their fonts locally.

## 7. Goodreads CSV import

If you use **Settings → Import from Goodreads**, you pick a `.csv` file that
you exported from Goodreads. A Goodreads export typically contains a great deal
of personal reading history: ISBNs, your star ratings, your private review
text, dates read and added, shelf names, reading counts, and more.

**The App reads the file on your device and extracts only two columns: the
title and the author of each book.** Nothing else in the file is parsed, sent
anywhere, or stored. The remaining columns — including your ratings, reviews,
and reading dates — are discarded in memory and never leave your device. The
titles and authors extracted are then saved to the destination shelf you chose,
exactly as if you had typed them in.

The file itself is copied to the App's temporary cache directory by the
operating system's file picker so it can be read, and is subject to normal
system cache cleanup. It is not uploaded.

## 8. Subscriptions and payments

TinyShelves Pro is an optional auto-renewable subscription sold through Apple
In-App Purchase. **All payment processing is performed by Apple.** We never
see, receive, or store your payment card number, billing address, Apple ID, or
any other payment credential.

We store only a true/false flag on your account recording whether an active
entitlement exists. RevenueCat, our subscription-management provider, receives
the information described in Section 6 in order to validate and track that
entitlement. Purchases, renewals, refunds, and cancellations are governed by
Apple's terms and your App Store account settings.

## 9. Legal bases for processing (EU/UK GDPR)

If you are in the European Economic Area, the United Kingdom, or Switzerland,
we process your personal data on the following legal bases under Article 6(1)
GDPR:

| What we process | Legal basis |
|---|---|
| Account creation, your library, shelves, books, reviews, images, and the delivery of core App features | **Contract** — Art. 6(1)(b): necessary to provide the service you asked for |
| Subscription entitlement status and purchase validation | **Contract** — Art. 6(1)(b) |
| Sending an image for text recognition; sharing a spine to the community library; making a shelf public; accessing your camera, photos, or a chosen file | **Consent** — Art. 6(1)(a): each of these happens only on an action you take, and each can be withdrawn (turn the feature off, revoke the permission, make the shelf private, or delete the content) |
| Technical logs, IP addresses, rate limiting, abuse prevention, security, and debugging | **Legitimate interests** — Art. 6(1)(f): keeping the service running, secure, and available. We have weighed this against your interests and consider the impact minimal, as this data is short-lived and not used to profile you |
| Content moderation, handling reports, blocking, and enforcing our Terms | **Legitimate interests** — Art. 6(1)(f), and **legal obligation** — Art. 6(1)(c) where obligations such as the EU Digital Services Act apply |
| Responding to lawful requests from authorities; establishing or defending legal claims | **Legal obligation** — Art. 6(1)(c) and **legitimate interests** — Art. 6(1)(f) |

Withdrawing consent does not affect the lawfulness of processing carried out
before withdrawal. Where we rely on legitimate interests, you have the right to
object — see Section 12.

**No automated decision-making.** We do not carry out automated
decision-making that produces legal or similarly significant effects
concerning you, and we do not profile you, within the meaning of Article 22
GDPR.

**International transfers.** Our providers, including Supabase, RevenueCat,
ISBNdb, and Google, are located in or transfer data to the **United States**
and potentially other countries outside the EEA and UK. Where personal data of
EEA or UK users is transferred outside those areas, we rely on the European
Commission's **Standard Contractual Clauses** (and the UK International Data
Transfer Addendum where applicable) as incorporated into our providers' data
processing agreements, or on an adequacy decision where one applies — including
the **EU–US Data Privacy Framework** for providers certified under it. You may
request further information about these safeguards using the contact details in
Section 1.

## 10. How long we keep data

| Data | Retention |
|---|---|
| Account, profile, library, images, reviews, ratings | Until you delete them, delete your account, or reset your data. We do not impose a fixed expiry |
| Technical and server logs, including IP addresses | Short-term only — typically no more than 30 days — after which they are deleted or aggregated |
| Moderation reports and block lists | For as long as needed to review and act on them and to address repeat abuse; reports are removed when the reporting or reported account is deleted |
| Subscription entitlement status | For the life of the account; purchase records are separately retained by Apple and RevenueCat under their own policies and retention rules |
| Backups | Routine encrypted backups may retain deleted content for a limited rolling period (typically up to 30 days) before being overwritten |
| Shared book records and spine images another user's shelf depends on | Retained after your deletion, disassociated from your account — see Section 5.4 |

Inactive accounts are not currently deleted automatically. We reserve the right
to remove accounts that have been inactive for an extended period, with notice
where we are able to give it.

## 11. Deleting your data — the tools in the App

You can act on your own data immediately, without contacting us and without any
waiting period:

- **Settings → Reset Data.** Deletes all of your bookshelves, the books you
  uploaded, your uploaded images, and your profile details, while keeping the
  account itself usable.
- **Settings → Account Deletion.** Permanently deletes your account and all
  data associated with it, including your profile, shelves, reviews, ratings,
  and every image you uploaded. **This cannot be undone**, and because accounts
  are anonymous, it cannot be reversed by contacting us.
- **Individual items.** You can delete any single book, shelf, review, image,
  or your public username at any time.
- **Blocking.** You can block any account from the "…" menu on its profile, and
  manage your block list in the App.

The one exception to full deletion is described in Section 5.4. If you believe
data associated with an account you controlled still exists, contact us and we
will investigate.

## 12. Your rights (EU/UK/EEA/Switzerland)

If the GDPR or UK GDPR applies to you, you have the right to:

- **Access** the personal data we hold about you, and receive a copy;
- **Rectification** of inaccurate or incomplete data;
- **Erasure** ("right to be forgotten");
- **Restriction** of processing in certain circumstances;
- **Data portability** — to receive data you provided in a structured,
  commonly used, machine-readable format and to have it transmitted to another
  controller where technically feasible;
- **Object** to processing based on legitimate interests, including at any time
  and for any reason where the processing is for direct marketing (we do no
  direct marketing);
- **Withdraw consent** at any time where processing is based on consent;
- **Not be subject** to solely automated decision-making with legal or
  similarly significant effects (we carry out none);
- **Lodge a complaint** with a supervisory authority.

**How to exercise them.** Because we hold no identifying information about you,
the fastest and most reliable route for access, rectification, erasure, and
portability is the in-app tooling in Section 11 — it acts directly on your
account without us needing to verify who you are. For anything the in-app tools
do not cover, email us at matthew.zimmerman7@gmail.com. We will respond within
**one month**, extendable by two further months for complex requests, as
permitted by Article 12(3) GDPR.

**Identity verification and its limits.** Article 11 GDPR provides that where a
controller cannot identify a data subject, it is not obliged to acquire
additional information solely to comply with the Regulation. We cannot link an
email address to an account, so if you email us a request we may be unable to
locate your data unless you can supply information that identifies the account
(for example your public username, or evidence of control of the device or
account). We will not ask you for identity documents. Where we cannot verify a
request, we will tell you, and we will always point you to the in-app tools,
which require no verification at all.

**Complaints.** You may complain to the supervisory authority in your EU member
state of residence, place of work, or place of the alleged infringement. A list
is maintained at <https://edpb.europa.eu/about-edpb/board/members_en>. In the
UK, the supervisory authority is the Information Commissioner's Office
(<https://ico.org.uk/make-a-complaint/>). In Switzerland, it is the FDPIC. We
would appreciate the chance to resolve your concern first, but you are not
required to contact us before complaining.

**EU representative.** We are established outside the EU and UK. We consider our
processing to be occasional, low-risk, and not involving special categories of
data on a large scale, and therefore within the derogation in Article 27(2)
GDPR from the obligation to designate a representative. If this changes, we
will designate representatives and update this policy with their details.

## 13. Your rights (California)

Under the California Consumer Privacy Act as amended by the CPRA, California
residents have the right to know, delete, correct, opt out of sale/sharing,
limit use of sensitive personal information, and not be discriminated against
for exercising these rights.

- **Categories collected in the past 12 months:** identifiers (a randomly
  generated account identifier and IP address); internet or other electronic
  network activity information (technical logs); visual information (images you
  upload); commercial information (subscription status); and other information
  you voluntarily create (reviews, ratings, shelf and book data). Sources,
  purposes, and recipients are described in Sections 3, 6, and 9.
- **We do not sell your personal information**, and we do not "share" it for
  cross-context behavioural advertising, as those terms are defined by the
  CCPA. We have not done so in the preceding 12 months. We do not sell or share
  the personal information of consumers we know to be under 16.
- **Sensitive personal information.** We do not collect sensitive personal
  information as defined by the CPRA, and therefore there is nothing to limit.
- **Exercising your rights.** Use the in-app tools in Section 11, or email us.
  We do not discriminate against users who exercise their rights — there is no
  price or service difference. An authorised agent may submit a request on your
  behalf with proof of authorisation, subject to the identification limits in
  Section 12.
- **Global Privacy Control.** Because we do not sell or share personal
  information, there is no opt-out preference signal to honour; we treat any
  such signal we receive as confirmation of our existing practice.

## 14. Your rights (other U.S. states)

Residents of states with comprehensive privacy laws — including Virginia,
Colorado, Connecticut, Utah, Texas, Oregon, Montana, and others as they take
effect — have broadly similar rights to access, correct, delete, and obtain a
copy of their personal data, and to opt out of targeted advertising, sale, and
profiling. We do not engage in targeted advertising, sale of personal data, or
profiling in furtherance of decisions with legal or similarly significant
effects. Exercise your rights through the in-app tools or by emailing us.
Where a state provides a right to appeal a refused request, you may appeal by
replying to our response; we will respond to the appeal within the period
required by your state's law, and will tell you how to contact your state
attorney general if you remain dissatisfied.

## 15. Your rights (other regions)

- **Canada (PIPEDA):** you may access and correct your personal information and
  complain to the Office of the Privacy Commissioner of Canada.
- **Brazil (LGPD):** you have rights of confirmation, access, correction,
  anonymisation, portability, deletion, and information about sharing.
- **Australia (Privacy Act):** you may access and correct your personal
  information and complain to the OAIC.
- **Japan, South Korea, and other jurisdictions:** we honour equivalent rights
  where local law grants them.

In every case, the in-app tools in Section 11 are the fastest route, and the
contact address in Section 1 is open to you.

## 16. Children

The App is not directed at children under 13, and we do not knowingly collect
personal information from children under 13. In the EEA and the UK, where the
GDPR sets the age of consent for information society services at between 13 and
16 depending on the member state, the App is not intended for users below the
applicable age in their country.

Because the App collects no contact information from any user, we have no means
of knowing a user's age. If you believe a child has provided personal
information through the App — for example by uploading an identifiable
photograph — contact us at matthew.zimmerman7@gmail.com and we will delete the
content and the associated account promptly.

## 17. Security

We protect your information with measures appropriate to its sensitivity and to
the size of our operation:

- All network traffic uses encrypted HTTPS/TLS connections.
- Data at rest is encrypted by our hosting provider.
- Database access is governed by row-level security policies enforced by the
  database itself, so each account can only read and write its own private
  data.
- Secrets and API keys used by our backend are held in the hosting provider's
  managed secret storage.
- Privileged operations, such as account deletion, run as constrained
  server-side routines rather than as unrestricted client access.

The App's design is itself a security measure: there is no password, email
address, postal address, or payment credential of yours in our systems, so
there is very little for an attacker to take. No system is perfectly secure,
however, and we cannot guarantee absolute security.

**Breach notification.** If a personal data breach occurs that is likely to
result in a risk to your rights and freedoms, we will notify the competent
supervisory authority within 72 hours of becoming aware of it where required by
Article 33 GDPR, and will notify affected users in the App or by other
available means where Article 34 or applicable law requires it.

## 18. Data stored on your device

The App stores the following locally on your device, outside our backend:

- your session token, so you stay signed in;
- your theme preference (light/dark);
- whether you have completed onboarding;
- if you use the home-screen widget: a snapshot of the shelf you chose to
  display, your selected shelf, and your premium flag, copied into a shared
  app-group container so the widget can render without launching the App;
- temporary image and file caches created while adding books or importing.

This data stays on your device and is removed when you delete the App. It is
not transmitted to us except as already described in this policy.

## 19. Changes to this policy

We may update this policy as the App changes or as the law does. When we do, we
will revise the "Last updated" date above. If the changes are **material** — for
example a new category of data, a new recipient, or a new purpose — we will
give you prominent notice in the App before or when the change takes effect,
and where the law requires consent for the change, we will ask for it. Your
continued use of the App after a non-material change takes effect constitutes
acceptance of the revised policy. Previous versions are available on request.

## 20. Contact

Questions, concerns, complaints, or data-subject requests:

**Matthew Zimmerman — matthew.zimmerman7@gmail.com**

We aim to respond to all privacy enquiries within 30 days, and within any
shorter period required by the law that applies to you.
