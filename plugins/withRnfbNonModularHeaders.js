// React Native Firebase pods import React-Core headers non-modularly, which errors
// under useFrameworks: "static". Allowing non-modular includes is the fix the RNFB
// docs prescribe for framework builds.
const { withPodfile } = require("@expo/config-plugins");

const SETTING = "CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES";

module.exports = function withRnfbNonModularHeaders(config) {
  return withPodfile(config, (podfileConfig) => {
    const { contents } = podfileConfig.modResults;
    if (!contents.includes(SETTING)) {
      podfileConfig.modResults.contents = contents.replace(
        /post_install do \|installer\|/,
        `post_install do |installer|\n    installer.pods_project.targets.each do |target|\n      target.build_configurations.each do |bc|\n        bc.build_settings['${SETTING}'] = 'YES'\n      end\n    end`
      );
    }
    return podfileConfig;
  });
};
