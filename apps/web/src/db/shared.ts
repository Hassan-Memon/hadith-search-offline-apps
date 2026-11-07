// Shared by the main thread and the SQLite worker (keep it free of imports).

/** Error prefix when another window kept the database files for too long. */
export const BUSY = 'database-busy';
