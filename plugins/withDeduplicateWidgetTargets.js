const { withXcodeProject } = require("expo/config-plugins");

/**
 * Expo config plugin that fixes "Multiple commands produce ExpoWidgetsTarget.appex"
 * build errors by removing duplicate "Embed App Extensions" build phases and
 * duplicate target dependencies from the Xcode project.
 */
const withDeduplicateWidgetTargets = (config) => {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const pbxProject = project.hash.project;

    // 1. Deduplicate "Embed App Extensions" copy-files build phases on the main target
    const nativeTargets = project.pbxNativeTargetSection();
    for (const key in nativeTargets) {
      const target = nativeTargets[key];
      if (typeof target !== "object" || !target.buildPhases) continue;

      const seen = new Set();
      target.buildPhases = target.buildPhases.filter((phase) => {
        const id = phase.value;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      // Also deduplicate target dependencies
      if (target.dependencies) {
        const seenDeps = new Set();
        target.dependencies = target.dependencies.filter((dep) => {
          const id = dep.value;
          if (seenDeps.has(id)) return false;
          seenDeps.add(id);
          return true;
        });
      }
    }

    // 2. Check for duplicate PBXCopyFilesBuildPhase entries that embed the
    //    same .appex product — keep only the first one
    const copyPhases = project.hash.project.objects["PBXCopyFilesBuildPhase"];
    if (copyPhases) {
      const appexPhaseIds = [];
      for (const key in copyPhases) {
        if (key.endsWith("_comment")) continue;
        const phase = copyPhases[key];
        if (
          phase &&
          phase.name &&
          phase.name.includes("Embed App Extensions")
        ) {
          appexPhaseIds.push(key);
        }
      }

      // If there are multiple "Embed App Extensions" phases, remove duplicates
      if (appexPhaseIds.length > 1) {
        const keptId = appexPhaseIds[0];
        for (let i = 1; i < appexPhaseIds.length; i++) {
          const dupId = appexPhaseIds[i];
          delete copyPhases[dupId];
          delete copyPhases[`${dupId}_comment`];

          // Remove from all native targets' buildPhases arrays
          for (const key in nativeTargets) {
            const target = nativeTargets[key];
            if (typeof target !== "object" || !target.buildPhases) continue;
            target.buildPhases = target.buildPhases.filter(
              (phase) => phase.value !== dupId
            );
          }
        }
      }
    }

    return config;
  });
};

module.exports = withDeduplicateWidgetTargets;
