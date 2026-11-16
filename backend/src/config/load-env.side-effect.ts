// Imported first by entry points, so process.env is filled before any module reads it
import { loadRootEnv } from './load-env.js';

loadRootEnv();
