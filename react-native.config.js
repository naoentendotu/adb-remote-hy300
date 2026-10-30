// uilib-native lists several imports in packageImportPath and autolinking keeps only the first; fully qualified names avoid needing imports.
module.exports = {
  dependencies: {
    'uilib-native': {
      platforms: {
        android: {
          packageImportPath: 'import com.wix.reactnativeuilib.dynamicfont.DynamicFontPackage;',
          packageInstance: `new DynamicFontPackage(),
      new com.wix.reactnativeuilib.highlighterview.HighlighterViewPackage(),
      new com.wix.reactnativeuilib.keyboardinput.KeyboardInputPackage(getApplication())`,
        },
      },
    },
  },
};
