import {httpDatabase} from './http-database';
// Hosted Sites support HTTPS, not raw PostgreSQL TCP sockets.
export const database=httpDatabase();
