const {
  withXcodeProject,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo config plugin that sets SWIFT_STRICT_CONCURRENCY to "minimal" for
 * CocoaPods dependencies, fixing strict-concurrency build errors in
 * dependencies like StripeCore that haven't been fully annotated for
 * strict concurrency yet.
 *
 * Expo SDK 55's expo-modules-core uses Swift 6-only actor isolation syntax
 * (e.g. `extension Foo: @MainActor Protocol`), so we also force Swift 6 for
 * Expo modules to avoid parser errors like "unknown attribute 'MainActor'".
 */
const withSwiftConcurrencyMinimal = (config) => {
  // 1. Set the build setting on all Xcode project configurations
  config = withXcodeProject(config, (config) => {
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

  // 2. Patch the Podfile to add a post_install hook that applies the setting
  //    to every pod target as well
  config = withDangerousMod(config, [
    "ios",
    (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );
      let podfile = fs.readFileSync(podfilePath, "utf8");

      const snippet = `
# [withSwiftConcurrencyMinimal] Set minimal concurrency for all pod targets
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |bc|
      bc.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
      if target.name.start_with?('Expo') || target.name == 'expo-modules-core'
        bc.build_settings['SWIFT_VERSION'] = '6.0'
      end
    end
  end
end
`;

      // Only add if not already present
      if (!podfile.includes("SWIFT_STRICT_CONCURRENCY")) {
        // If there's already a post_install block we need to inject into it;
        // otherwise append to the end.
        if (podfile.includes("post_install do |installer|")) {
          // Inject our loop right after the existing post_install opener
          podfile = podfile.replace(
            /post_install do \|installer\|/,
            `post_install do |installer|
  # [withSwiftConcurrencyMinimal] Set minimal concurrency for all pod targets
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |bc|
      bc.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
      if target.name.start_with?('Expo') || target.name == 'expo-modules-core'
        bc.build_settings['SWIFT_VERSION'] = '6.0'
      end
    end
  end`
          );
        } else {
          podfile += snippet;
        }
        fs.writeFileSync(podfilePath, podfile);
      }

      return config;
    },
  ]);

  return config;
};

module.exports = withSwiftConcurrencyMinimal;
