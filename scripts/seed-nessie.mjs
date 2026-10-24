import { seedNessie } from '../server/nessie.mjs';
try { await seedNessie(); } catch (error) { console.error(error.message); process.exitCode = 1; }
