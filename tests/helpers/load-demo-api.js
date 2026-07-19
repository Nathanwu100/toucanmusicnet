const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class DemoStorage {
  constructor(sharedDatabase = new Map()) {
    this.sharedDatabase = sharedDatabase;
    this.session = new Map();
  }

  target(key) {
    return key.startsWith("toucan_db_") ? this.sharedDatabase : this.session;
  }

  getItem(key) {
    return this.target(key).has(key) ? this.target(key).get(key) : null;
  }

  setItem(key, value) {
    this.target(key).set(key, String(value));
  }

  removeItem(key) {
    this.target(key).delete(key);
  }

  clear() {
    this.sharedDatabase.clear();
    this.session.clear();
  }
}

function loadDemoApi(storage = new DemoStorage()) {
  const window = {
    TOUCAN_CONFIG: { FORCE_DEMO: true, ADMIN_EMAIL: "admin@toucanmusic.org" },
    location: { hostname: "localhost", origin: "http://localhost:8080" },
    supabase: null,
  };
  const context = vm.createContext({
    window,
    localStorage: storage,
    URL,
    Date,
    Math,
    JSON,
    console,
    setTimeout,
    clearTimeout,
  });
  const source = fs.readFileSync(path.join(__dirname, "../../js/api.js"), "utf8");
  vm.runInContext(source, context, { filename: "js/api.js" });
  return { api: window.ToucanAPI, storage };
}

function readDemoDb(storage) {
  return JSON.parse(storage.getItem("toucan_db_v3"));
}

function writeDemoDb(storage, db) {
  storage.setItem("toucan_db_v3", JSON.stringify(db));
}

module.exports = { DemoStorage, loadDemoApi, readDemoDb, writeDemoDb };
