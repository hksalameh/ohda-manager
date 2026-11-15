// Standalone QA installer which never overwrites the production installation.
// The runtime detects the QA_BUILD marker and uses %APPDATA%/OhdaManager-QA.
const base = require("../package.json").build;
module.exports = {
  ...base,
  appId: "org.iccs.ohda.qa",
  productName: "Ohda Manager QA",
  win: {
    ...base.win,
    artifactName: "Ohda-Manager-QA-${version}.${ext}",
  },
  nsis: {
    ...base.nsis,
    shortcutName: "إدارة العهد واللوازم - للتجربة",
    uninstallDisplayName: "نظام إدارة العهد واللوازم - نسخة تجريبية",
  },
};
