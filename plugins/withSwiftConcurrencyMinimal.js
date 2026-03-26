const { withXcodeProject } = require("expo/config-plugins");

/**
 * Expo config plugin that sets SWIFT_STRICT_CONCURRENCY to "minimal" for all
 * targets, fixing Swift 6 strict-concurrency build errors in dependencies like
 * expo-modules-core that haven't been fully annotated yet.
 */
const withSwiftConcurrencyMinimal = (config) => {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();

    for (const key in configurations) {
      const buildSettings = configurations[key].buildSettings;
      if (buildSettings) {
        buildSettings.SWIFT_STRICT_CONCURRENCY = "minimal";
      }
    }

    return config;
  });
};

module.exports = withSwiftConcurrencyMinimal;
