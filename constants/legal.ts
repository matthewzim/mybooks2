/**
 * Legal URLs
 *
 * Apple requires apps that offer auto-renewable subscriptions to expose
 * functional links to a Privacy Policy and Terms of Use (EULA) inside the
 * app (App Review Guideline 3.1.2). These same URLs must also be entered
 * in App Store Connect (App Privacy section and the app description /
 * License Agreement field) and in the RevenueCat paywall configuration.
 */
export const LEGAL_URLS = {
  /**
   * Apple's standard EULA is explicitly allowed for subscription apps and
   * is a valid link to ship with. A custom Terms of Use draft (with Apple's
   * required minimum terms and a UGC/IP clause) lives at
   * legal/terms-of-use.md — once you host it, point this at that URL.
   */
  TERMS_OF_USE:
    'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/',

  /**
   * TODO(before App Store submission): host legal/privacy-policy.md and
   * replace this with its live URL. This page MUST be reachable before you
   * submit for review — a broken link here is a guaranteed rejection.
   */
  PRIVACY_POLICY:
    'https://matthewzim.github.io/virtual-library-legal/privacy-policy',

  /**
   * TODO(before App Store submission): replace with a monitored support
   * contact page or email. Also entered as the Support URL in App Store
   * Connect.
   */
  SUPPORT: 'mailto:matthew.zimmerman7@gmail.com',
} as const;
