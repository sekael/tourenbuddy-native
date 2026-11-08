// Compares the permissions a release build declares with permissions.json, the reviewed list the
// store privacy answers are filled from. Run by .github/workflows/native-build.yml:
//   node scripts/check-permissions.js android <`aapt2 dump permissions` output>
//   node scripts/check-permissions.js ios <the built Info.plist as JSON>
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const declared = {
  android: (dump) =>
    [...dump.matchAll(/^uses-permission(?:-sdk-23)?: name='([^']+)'/gm)].map((match) => match[1]),
  ios: (json) => {
    const plist = JSON.parse(json);
    return [
      ...Object.keys(plist).filter((key) => /^NS\w+UsageDescription$/.test(key)),
      ...(plist.UIBackgroundModes ?? []).map((mode) => `UIBackgroundModes: ${mode}`),
    ];
  },
};

/** What the build declares beyond the reviewed list, and what it no longer declares. */
function review(platform, output, reviewed) {
  const found = new Set(declared[platform](output));
  return {
    added: [...found].filter((entry) => !reviewed.includes(entry)).sort(),
    missing: reviewed.filter((entry) => !found.has(entry)).sort(),
  };
}

function main([platform, file]) {
  if (!(platform in declared) || !file) {
    console.error('Usage: node scripts/check-permissions.js android|ios <file>');
    return 2;
  }
  const reviewed = JSON.parse(readFileSync(join(__dirname, '..', 'permissions.json'), 'utf8'))[
    platform
  ];
  const { added, missing } = review(platform, readFileSync(file, 'utf8'), reviewed);
  if (added.length === 0 && missing.length === 0) {
    console.log(`${platform}: the build declares the ${reviewed.length} reviewed permissions.`);
    return 0;
  }
  for (const entry of added) console.error(`+ ${entry}: declared by the build, not reviewed`);
  for (const entry of missing) console.error(`- ${entry}: reviewed, no longer declared`);
  console.error(
    `Block an unwanted permission in app.config.ts, or update "${platform}" in permissions.json ` +
      'and the store privacy answers (docs/publishing.md).',
  );
  return 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { review };
