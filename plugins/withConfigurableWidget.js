/**
 * Temporary no-op plugin.
 *
 * The previous implementation overwrote the expo-widgets generated
 * BookshelfWidget.swift with a custom AppIntent-based provider.
 *
 * With current expo-widgets versions, that custom file referenced symbols
 * that are not publicly exported from the ExpoWidgets module in widget
 * extension compilation (for example WidgetsStorage and the
 * WidgetsTimelineEntry memberwise initializer), which caused iOS build
 * failures in EAS/Xcode.
 *
 * Returning the config unchanged allows expo-widgets to keep generating the
 * default, supported StaticConfiguration widget source.
 */
const withConfigurableWidget = (config) => config;

module.exports = withConfigurableWidget;
