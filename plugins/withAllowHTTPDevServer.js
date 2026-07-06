const { withInfoPlist } = require("expo/config-plugins");

/**
 * Expo config plugin that ensures App Transport Security allows HTTP
 * connections to the Metro dev server. This is needed when the dev client
 * connects via a non-localhost IP address (e.g. a campus or LAN IP).
 *
 * Runs via withInfoPlist so it merges into the final Info.plist reliably,
 * even if other plugins touch ATS settings.
 *
 * The ATS exceptions are only applied to development builds. On EAS the
 * build profile is exposed as EAS_BUILD_PROFILE; local `expo run:ios` /
 * `expo prebuild` runs have no profile set and are treated as development.
 * Preview and production builds get the iOS default (HTTPS only) so the
 * shipped binary never carries NSAllowsArbitraryLoads, which App Review
 * flags and which would require a justification during submission.
 */
const DEV_PROFILES = [undefined, "", "development"];

const withAllowHTTPDevServer = (config) => {
  return withInfoPlist(config, (config) => {
    if (DEV_PROFILES.includes(process.env.EAS_BUILD_PROFILE)) {
      config.modResults.NSAppTransportSecurity = {
        ...config.modResults.NSAppTransportSecurity,
        NSAllowsArbitraryLoads: true,
        NSAllowsLocalNetworking: true,
      };
    } else {
      // Make sure nothing merged earlier leaves the flag on in release builds.
      delete config.modResults.NSAppTransportSecurity;
    }
    return config;
  });
};

module.exports = withAllowHTTPDevServer;
