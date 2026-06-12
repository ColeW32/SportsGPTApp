// On EAS builders the gitignored GoogleService-Info.plist arrives as a secret
// file env var (GOOGLE_SERVICES_INFOPLIST resolves to a local path); locally the
// repo-root copy is used.
module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    googleServicesFile: process.env.GOOGLE_SERVICES_INFOPLIST ?? config.ios.googleServicesFile,
  },
});
