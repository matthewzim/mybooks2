# Privacy Policy — TinyShelves

**Effective date:** August 3, 2026
**Developer:** Matthew Zimmerman ("we," "us," or "the developer")
**Contact:** matthew.zimmerman7@gmail.com

This Privacy Policy explains what information the TinyShelves iOS app
("the App") collects, how it is used, and the choices you have. The short
version: **we never ask for your name, email address, or any other contact
information; accounts are anonymous; we show no ads and use no analytics or
tracking SDKs; and you can permanently delete everything from inside the
App.**

## 1. Anonymous Accounts

When you first open the App, a random, anonymous account identifier is
created for you. We do not collect your name, email address, phone number,
or any other personally identifying information, and we have no way to
connect your account to you personally. The App assigns your account a
randomly generated display name and public username, both of which you can
change in Settings. Because accounts are anonymous, deleting the App
without first using the in-app Account Deletion option may leave your
account unrecoverable.

## 2. Information We Store

The following information is stored on our backend (hosted by Supabase) and
is linked to your anonymous account ID:

- **Profile data:** your display name and public username.
- **Library data:** the bookshelves you create, the books you add (title,
  author, ISBN), how you arrange them, and your personal reviews and
  ratings.
- **Images you add:** the photos of book spines you take or select. The App
  also downloads a cover image for your books from ISBNdb (see Section 4)
  and stores a copy so it doesn't have to be fetched again.
- **Subscription status:** whether your account has an active premium
  entitlement (a true/false flag — see Section 5).
- **Moderation data:** reports you file about other users' content and your
  list of blocked users.

### Public visibility

**New bookshelves are public by default.** You can make a shelf private
with the Public/Private toggle when you create it, or change it later in
the shelf's settings. When a shelf is public, its name, description, the
books on it, their spine images, and your display name and public username
are visible to other users of the App. Your profile can also be found by
searching your display name or public username in the community section,
and public shelves may be featured in the community feed.

### Shared book and spine records

Books in the App are stored as shared records rather than as private copies:

- **Spine photos are shared with the community by default.** When you scan a
  spine, the photo is offered in Browse Community alongside your display
  name, and other users can add it to their own shelves. The Add Book
  screen has a "Share with Community" toggle you can turn off for that
  book. This is independent of whether the shelf is public — a spine
  photo can be shared with the community even if the shelf holding it is
  private.
- **Book details are shared.** Because several users can reference the same
  book record, editing a book's title, author, or ISBN may change it for
  other users who hold that book.

Your reviews, ratings, and shelf arrangement are always private to your
account and are never shown to other users.

## 3. Camera, Photos, and Files

The App requests camera access to let you photograph book spines and whole
bookshelves, and photo library access to let you choose existing photos for
the same purpose. The App never scans your photo library in the background
and never accesses photos you did not explicitly select.

- **Spine photos** are uploaded and stored as described in Section 2.
- **Bookshelf photos** (the "scan a shelf" feature) are used only to read
  the titles off the spines. The photo is sent for text recognition (see
  Section 4) and is **not** uploaded to our backend or stored — only the
  book titles and authors identified from it are saved.
- **Goodreads import** uses the iOS file picker so you can select a CSV
  file you exported from Goodreads. The App reads only the title and author
  columns from that file; the rest of the export (dates, shelves, private
  notes, and anything else Goodreads includes) is ignored and never
  uploaded.

## 4. Third-Party Services

We use a small number of service providers to run the App. Each receives
only the minimum data needed to do its job:

- **Supabase** (backend hosting): stores the account and library data
  described in Section 2, including uploaded images.
- **RevenueCat** and **Apple In-App Purchase** (subscriptions): all
  payments are processed by Apple. We never see or store your payment card
  details, billing address, or Apple ID. RevenueCat receives your anonymous
  account ID and purchase receipt information from Apple in order to manage
  your subscription entitlement.
- **ISBNdb** (book lookup): when you search for a book, scan a spine, or
  the App looks for a cover image, the search text (title, author, or ISBN)
  is sent to ISBNdb to fetch book details and a cover image. Cover images
  found this way are copied to our storage so they don't have to be
  re-fetched.
- **Google Cloud Vision API** (text recognition): if you scan a book spine
  or a whole bookshelf, the photo is sent to Google for text recognition so
  the App can identify the books. The photo is used only for that one-time
  recognition and is not stored by us.

We do not sell your data, share it with data brokers, or use it for
advertising. No third-party advertising, analytics, or tracking SDKs are
included in the App, and we do not track you across other companies' apps
or websites.

## 5. Subscriptions

TinyShelves Pro is an optional auto-renewable subscription billed
through your Apple account. Purchases, renewals, refunds, and cancellations
are all handled by Apple. We store only whether your anonymous account
currently has an active entitlement.

## 6. Data Stored on Your Device

The App stores your session token, theme preference, and onboarding state
locally on your device. If you use the home-screen widget, a snapshot of
your shelves and their spine images is copied into a shared container on
your device so the widget can render whichever shelf you select, along with
your premium status. This data never leaves your device except as described
in Section 2.

## 7. Data Retention and Deletion

Your data is retained for as long as your account exists. You can delete
your data at any time, from inside the App, with no waiting period:

- **Settings → Reset Data** deletes your bookshelves, the books you added,
  your uploaded images, and your profile details, while keeping the account
  usable.
- **Settings → Account Deletion** permanently deletes your account, your
  library, and your uploaded images. This cannot be undone.

**One exception applies to both.** If another user has added one of your
shared book spines to their shelf, that book record and its spine image are
kept rather than deleted, so their shelf doesn't break. The retained record
is disconnected from your account — your account ID is removed from it —
and nothing that identifies you stays attached to it. Everything else,
including every image no one else is using, is deleted.

If you have questions about deletion, or believe data associated with an
account you controlled still exists, contact us at the email above.

## 8. Your Rights

Depending on where you live (for example, under the GDPR in the EU/UK or
the CCPA in California), you may have rights to access, correct, delete, or
export your data. Because accounts are anonymous, the in-app tools above
are the way to exercise these rights — they act directly on your account
without us needing to verify your identity. For anything the in-app tools
don't cover, email us.

## 9. Children

The App is not directed at children under 13, and we do not knowingly
collect personal information from children. Because accounts are anonymous,
the App collects no contact information from any user of any age.

## 10. Security

Data is transmitted over encrypted (HTTPS/TLS) connections and stored with
access controls (row-level security) so that each account can only access
its own private data. Stored images are served through expiring signed
links. No system is perfectly secure, but the App's anonymous design means
there is no password, email, or payment data of yours for us to lose.

## 11. Changes to This Policy

If we make material changes to this policy, we will update the effective
date above and, where appropriate, notify you in the App. Continued use of
the App after changes take effect constitutes acceptance of the revised
policy.

## 12. Contact

Questions, concerns, or requests: **matthew.zimmerman7@gmail.com**
