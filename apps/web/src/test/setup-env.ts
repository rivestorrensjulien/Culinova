import { loadTestEnv, testDatabaseUrl } from "./env";

loadTestEnv();
// Le code applicatif lit DATABASE_URL : on le fait pointer vers la base de test.
const url = testDatabaseUrl();
if (url) process.env.DATABASE_URL = url;
