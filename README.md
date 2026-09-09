# GENZ Raipur Broker Network

Private broker pilot for Raipur. Construction leads are outside the current scope.

## Deployment

- Source: `dharaluxe/genz-raipur-network` on GitHub.
- Hosting and identity: ChatGPT Sites, preserving the existing GENZ address and access policy.
- Database: the existing Supabase project named `construction`, in the isolated `genz` schema.
- Evidence: the existing private Sites R2 bucket, preserving original document IDs and bytes.

The app includes broker invitations and approval, properties and owner confirmations, customer introductions, visits, co-broker agreements, price amendments, a manual cash/UPI ledger, complaints, and broker ID verification. An accepted agreement records whether brokerage is fixed, a percentage of final price, or the amount above the owner's net price. Percentage and above-net calculations update with the agreed final price. Fixed fees change through a bilateral amendment. Finalized payments and agreement history are not silently overwritten.

## Security and transport

Sites cannot connect to PostgreSQL over raw TCP. The server uses HTTPS to a Supabase Edge Function. A random server-only key authenticates this connection; its SHA-256 digest is embedded during function deployment. The function accepts only the SQL templates generated from the app's source, binds values separately, and runs transactions as the restricted `genz_app` role. Anonymous and Supabase authenticated roles have no access to `genz`. Application routes enforce membership, ownership and counterpart permissions. Audit entries cannot be updated or deleted by the app role.

Do not enable `GENZ_AUTH_PROVIDER=sites` on a host that does not provide trusted Sites dispatch headers. The optional Supabase password-auth mode requires separate verified email delivery configuration and is not used on this deployment.

## Development and verification

Use Node 22+, the committed lockfile, and `npm ci`. Run:

```
node scripts/prepare-database-bridge.mjs
npx tsc --noEmit
node --test tests/network-api.test.mjs tests/network-postgres.test.mjs tests/brokerage.test.mjs
npm run build
```

When changing server SQL, regenerate and redeploy the function's query allowlist before deploying the app. Supabase function sources are in `supabase/functions/genz-database`; the deployment replaces the key-hash placeholder without committing the plaintext key. Use the encrypted host settings described in `config.env.example`.

## Pilot limits

This is an owner-private deployment until its audience is deliberately expanded. Public broker lookup, broker onboarding and property-owner access require the corresponding launch/access settings. Automated SMS, eSign, payment gateways, owner ratings, agency handover, legal review and an independently tested backup-restoration process are not certified complete. Cash acknowledgment records are evidence of the parties' statements, not bank verification or a legal-compliance certification.

GitHub contains source only. Never commit customer data, documents, passwords, database exports or hosting keys. See `MIGRATION.md` for cutover and rollback notes.
