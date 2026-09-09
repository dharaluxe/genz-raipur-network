// Only bundled into the isolated API test harness; never imported by the app.
export const env = globalThis.__genzTest.env;
export const database=globalThis.__genzTest.env.DB;
export const documentBucket=globalThis.__genzTest.env.BUCKET;
export async function authenticatedUser(){const h=globalThis.__genzTest.headers;const id=h.get('oai-authenticated-user-id'),email=h.get('oai-authenticated-user-email');return id&&email?{id,email,name:email}:null;}
export async function headers(){return globalThis.__genzTest.headers;}
export function redirect(){throw new Error('Unexpected redirect in API test');}
