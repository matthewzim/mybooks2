/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",
  name: "BookshelfWidget",
  displayName: "My Bookshelf",
  frameworks: ["SwiftUI", "WidgetKit"],
  deploymentTarget: "17.0",
  colors: {
    $widgetBackground: { light: "#FFFFFF", dark: "#1C1C1E" },
    $accent: "#8B4513",
  },
  entitlements: {
    "com.apple.security.application-groups": [
      "group.com.yourcompany.virtuallibrary",
    ],
  },
};
