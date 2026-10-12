// Expo config plugin: raises Gradle / Kotlin daemon memory in android/gradle.properties.
//
// Why: the SDK 54 template ships `org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m`. KSP processing of
// expo-updates (and other modules) exhausts 512 MB of Metaspace ("java.lang.OutOfMemoryError: Metaspace" in
// :expo-updates:kspReleaseKotlin), after which the Gradle daemon deadlocks and the build hangs until killed
// (observed in CI: 74 minutes, cancelled by the job timeout). Runs at `expo prebuild`, so it also applies to
// `eas build --local`. Idempotent: only sets the keys below.

const { withGradleProperties } = require('expo/config-plugins');

const SETTINGS = {
  'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1536m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8',
  'kotlin.daemon.jvmargs': '-Xmx3072m -XX:MaxMetaspaceSize=1536m',
};

function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(SETTINGS)) {
      const existing = cfg.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
}

module.exports = withGradleMemory;
module.exports.SETTINGS = SETTINGS;
