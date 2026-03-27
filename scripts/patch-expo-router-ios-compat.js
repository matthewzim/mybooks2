#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const patches = [
  {
    file: 'node_modules/expo-router/ios/Toolbar/RouterToolbarItemView.swift',
    replacements: [
      {
        from: '      item = controller.navigationItem.searchBarPlacementBarButtonItem\n',
        to: '      logger?.warn("[expo-router] Search bar toolbar placement requires a newer iOS SDK; falling back to no toolbar item.")\n      currentBarButtonItem = nil\n      return\n'
      },
      {
        from: '    if #available(iOS 26.0, *) {\n      item.hidesSharedBackground = hidesSharedBackground\n      item.sharesBackground = sharesBackground\n    }\n',
        to: '    // iOS 26 toolbar background-sharing APIs are unavailable in older Xcode SDKs.\n'
      },
      {
        from: '    if #available(iOS 26.0, *) {\n      if let badgeConfig = badgeConfiguration {\n        var badge = UIBarButtonItem.Badge.indicator()\n        if let value = badgeConfig.value {\n          badge = .string(value)\n        }\n        if let backgroundColor = badgeConfig.backgroundColor {\n          badge.backgroundColor = backgroundColor\n        }\n        if let foregroundColor = badgeConfig.color {\n          badge.foregroundColor = foregroundColor\n        }\n        if badgeConfig.fontFamily != nil || badgeConfig.fontSize != nil\n          || badgeConfig.fontWeight != nil {\n          let font = RouterFontUtils.convertTitleStyleToFont(\n            TitleStyle(\n              fontFamily: badgeConfig.fontFamily,\n              fontSize: badgeConfig.fontSize,\n              fontWeight: badgeConfig.fontWeight\n            ))\n          badge.font = font\n        }\n        item.badge = badge\n      } else {\n        item.badge = nil\n      }\n    }\n',
        to: '    // iOS 26 UIBarButtonItem badge APIs are unavailable in older Xcode SDKs.\n'
      }
    ]
  },
  {
    file: 'node_modules/expo-router/ios/Toolbar/RouterToolbarHostView.swift',
    replacements: [
      {
        from: '            if #available(iOS 26.0, *) {\n              if let hidesSharedBackground = menu.hidesSharedBackground {\n                item.hidesSharedBackground = hidesSharedBackground\n              }\n              if let sharesBackground = menu.sharesBackground {\n                item.sharesBackground = sharesBackground\n              }\n            }\n',
        to: '            // iOS 26 toolbar background-sharing APIs are unavailable in older Xcode SDKs.\n'
      }
    ]
  },
  {
    file: 'node_modules/expo-router/ios/Toolbar/RouterToolbarModule.swift',
    replacements: [
      {
        from: '    case .prominent:\n      if #available(iOS 26.0, *) {\n        return .prominent\n      } else {\n        return .done\n      }\n',
        to: '    case .prominent:\n      // `.prominent` is only available with a newer iOS SDK.\n      return .done\n'
      }
    ]
  },
  {
    file: 'node_modules/expo-image-picker/ios/MediaHandler.swift',
    replacements: [
      {
        from: '  private func getMimeType(from asset: PHAsset?, fileExtension: String) -> String? {\n    let utType: UTType? = if #available(iOS 26.0, *) {\n      asset?.contentType ?? UTType(filenameExtension: fileExtension)\n    } else {\n      UTType(filenameExtension: fileExtension)\n    }\n    return utType?.preferredMIMEType\n  }\n',
        to: '  private func getMimeType(from asset: PHAsset?, fileExtension: String) -> String? {\n    // `PHAsset.contentType` requires a newer Photos SDK and is unavailable in older Xcode toolchains.\n    // Fall back to extension-based detection for broad compatibility.\n    let utType = UTType(filenameExtension: fileExtension)\n    return utType?.preferredMIMEType\n  }\n'
      },
      {
        from: '  private func getMimeType(from resource: PHAssetResource, fileExtension: String) -> String? {\n    let utType: UTType? = if #available(iOS 26.0, *) {\n      resource.contentType\n    } else {\n      UTType(resource.uniformTypeIdentifier) ?? UTType(filenameExtension: fileExtension)\n    }\n    return utType?.preferredMIMEType\n  }\n',
        to: '  private func getMimeType(from resource: PHAssetResource, fileExtension: String) -> String? {\n    // `PHAssetResource.contentType` requires a newer Photos SDK and is unavailable in older Xcode toolchains.\n    let utType = UTType(resource.uniformTypeIdentifier) ?? UTType(filenameExtension: fileExtension)\n    return utType?.preferredMIMEType\n  }\n'
      }
    ]
  },
  {
    file: 'node_modules/expo-image/ios/ImageView.swift',
    replacements: [
      {
        from: '  @available(iOS 26.0, tvOS 26.0, *)\n  private func applySymbolEffectiOS26(effect: SFSymbolEffectType, scope: SFSymbolEffectScope?, options: SymbolEffectOptions) {\n    switch effect {\n    case .drawOn:\n      switch scope {\n      case .byLayer: sdImageView.addSymbolEffect(.drawOn.byLayer, options: options)\n      case .wholeSymbol: sdImageView.addSymbolEffect(.drawOn.wholeSymbol, options: options)\n      case .none: sdImageView.addSymbolEffect(.drawOn, options: options)\n      }\n    case .drawOff:\n      switch scope {\n      case .byLayer: sdImageView.addSymbolEffect(.drawOff.byLayer, options: options)\n      case .wholeSymbol: sdImageView.addSymbolEffect(.drawOff.wholeSymbol, options: options)\n      case .none: sdImageView.addSymbolEffect(.drawOff, options: options)\n      }\n    default:\n      break\n    }\n  }\n',
        to: '  @available(iOS 26.0, tvOS 26.0, *)\n  private func applySymbolEffectiOS26(effect: SFSymbolEffectType, scope: SFSymbolEffectScope?, options: SymbolEffectOptions) {\n    // drawOn/drawOff symbol effects require a newer Xcode SDK and are unavailable in older toolchains.\n  }\n'
      }
    ]
  }
];

let touched = 0;
for (const patch of patches) {
  const fullPath = path.join(repoRoot, patch.file);
  if (!fs.existsSync(fullPath)) {
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  let changed = false;

  for (const { from, to } of patch.replacements) {
    if (content.includes(to)) {
      continue;
    }

    if (!content.includes(from)) {
      throw new Error(`Expected snippet not found in ${patch.file}`);
    }

    content = content.replace(from, to);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(fullPath, content);
    touched += 1;
  }
}

if (touched > 0) {
  console.log(`Applied iOS compatibility patch to ${touched} file(s).`);
} else {
  console.log('No expo-router iOS compatibility patch changes were necessary.');
}
