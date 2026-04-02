const { withInfoPlist } = require("expo/config-plugins");

/**
 * Expo config plugin that ensures App Transport Security allows HTTP
 * connections to the Metro dev server. This is needed when the dev client
 * connects via a non-localhost IP address (e.g. a campus or LAN IP).
 *
 * Runs via withInfoPlist so it merges into the final Info.plist reliably,
 * even if other plugins touch ATS settings.
 */
const withAllowHTTPDevServer = (config) => {
  return withInfoPlist(config, (config) => {
    config.modResults.NSAppTransportSecurity = {
      ...config.modResults.NSAppTransportSecurity,
      NSAllowsArbitraryLoads: true,
      NSAllowsLocalNetworking: true,
    };
    return config;
  });
};

module.exports = withAllowHTTPDevServer;
