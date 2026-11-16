import { loadRootEnv } from '../../src/config/load-env.js';

// Tests run with the account switcher off whatever the local .env says; its own suite turns it on
process.env.DEV_ACCOUNT_SWITCHER ??= 'false';
loadRootEnv();
