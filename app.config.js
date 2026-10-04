// Adds non-sensitive build identity to the static app.json config.
// GITHUB_SHA is set by CI; local builds report "local".
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    sourceSha: (process.env.GITHUB_SHA || 'local').slice(0, 7),
  },
});
