const {
  withXcodeProject,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo config plugin that sets SWIFT_STRICT_CONCURRENCY to "minimal" for
 * CocoaPods dependencies, reducing Swift concurrency checks in third-party pods.
 *
 * Some Expo SDK 55 files in expo-modules-core use protocol-conformance actor
 * isolation syntax like `extension Foo: @MainActor Protocol`, which isn't
 * supported by older Swift toolchains. We patch those declarations into an
 * equivalent form that older compilers accept.
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

  // 2. Patch the Podfile to apply the same setting to all pod targets.
  // Keep Expo pods on Swift 5.10 to avoid Swift 6 isolation hard-errors.
  config = withDangerousMod(config, [
    "ios",
    (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );
      let podfile = fs.readFileSync(podfilePath, "utf8");

      const marker =
        "# [withSwiftConcurrencyMinimal] Set minimal concurrency for all pod targets";
      const snippet = `
${marker}
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |bc|
      bc.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
      if target.name.downcase.include?('expo')
        bc.build_settings['SWIFT_VERSION'] = '5.10'
      end
    end
  end`;

      if (podfile.includes("post_install do |installer|")) {
        if (podfile.includes(marker)) {
          podfile = podfile.replace(
            new RegExp(`${marker}[\\s\\S]*?end\\n`, "m"),
            `${snippet}\n`
          );
        } else {
          podfile = podfile.replace(
            /post_install do \|installer\|/,
            `post_install do |installer|${snippet}`
          );
        }
      } else {
        podfile += `
post_install do |installer|${snippet}
end
`;
      }

      fs.writeFileSync(podfilePath, podfile);

      return config;
    },
  ]);

  // 3. Patch expo-modules-core Swift sources for older Swift parser support.
  config = withDangerousMod(config, [
    "ios",
    (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const patches = [
        {
          file: path.join(
            projectRoot,
            "node_modules/expo-modules-core/ios/Core/Views/ViewDefinition.swift"
          ),
          from: "extension UIView: @MainActor AnyArgument {",
          to: "@MainActor\nextension UIView: AnyArgument {",
        },
        {
          file: path.join(
            projectRoot,
            "node_modules/expo-modules-core/ios/Core/Views/SwiftUI/SwiftUIVirtualView.swift"
          ),
          from: "extension ExpoSwiftUI.SwiftUIVirtualView: @MainActor ExpoSwiftUI.ViewWrapper {",
          to: "@MainActor\nextension ExpoSwiftUI.SwiftUIVirtualView: ExpoSwiftUI.ViewWrapper {",
        },
        {
          file: path.join(
            projectRoot,
            "node_modules/expo-modules-core/ios/Core/Views/SwiftUI/SwiftUIHostingView.swift"
          ),
          from: "public final class HostingView<Props: ViewProps, ContentView: View<Props>>: ExpoView, @MainActor AnyExpoSwiftUIHostingView {",
          to: "@MainActor\n  public final class HostingView<Props: ViewProps, ContentView: View<Props>>: ExpoView, AnyExpoSwiftUIHostingView {",
        },
      ];

      patches.forEach(({ file, from, to }) => {
        if (!fs.existsSync(file)) {
          return;
        }

        const content = fs.readFileSync(file, "utf8");
        if (!content.includes(from) || content.includes(to)) {
          return;
        }

        fs.writeFileSync(file, content.replace(from, to));
      });

      return config;
    },
  ]);

  return config;
};

module.exports = withSwiftConcurrencyMinimal;
