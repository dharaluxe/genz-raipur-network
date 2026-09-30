import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const env = process.env;
const required = [
  'GENZ_RUNTIME_SUPABASE_URL',
  'GENZ_RUNTIME_SUPABASE_ANON_KEY',
  'GENZ_RUNTIME_SUPABASE_SERVICE_ROLE_KEY',
  'GENZ_E2E_BUYER_A_EMAIL',
  'GENZ_E2E_BUYER_A_PASSWORD',
  'GENZ_E2E_BUYER_B_EMAIL',
  'GENZ_E2E_BUYER_B_PASSWORD',
  'GENZ_E2E_LISTING_EMAIL',
  'GENZ_E2E_LISTING_PASSWORD',
  'GENZ_E2E_REQUIREMENT_A_ID',
  'GENZ_E2E_REQUIREMENT_B_ID',
  'GENZ_E2E_PROPERTY_ID',
];

for (const name of required) {
  if (!env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const runtimeUrl = new URL(env.GENZ_RUNTIME_SUPABASE_URL);
const projectRef = runtimeUrl.hostname.split('.')[0];
const expectedProjectRef = env.GENZ_EXPECTED_PROJECT_REF || 'zvftcwinvbnavvjfmugr';
if (projectRef !== expectedProjectRef) {
  throw new Error(`Runtime project mismatch: expected ${expectedProjectRef}, got ${projectRef}`);
}

const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};
const service = createClient(runtimeUrl.toString(), env.GENZ_RUNTIME_SUPABASE_SERVICE_ROLE_KEY, options);

async function login(label, email, password) {
  const client = createClient(runtimeUrl.toString(), env.GENZ_RUNTIME_SUPABASE_ANON_KEY, options);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`${label} login failed: ${error?.message || 'no user'}`);
  return { client, user: data.user };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function one(client, table, id, columns = '*') {
  const { data, error } = await client.from(table).select(columns).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

async function cleanup(ids) {
  const entityIds = [ids.dealA, ids.dealB, ids.offerA, ids.offerB].filter(Boolean).map(String);
  if (entityIds.length) {
    await service.from('genz_notifications').delete().in('entity_id', entityIds);
    await service.from('genz_followups').delete().in('entity_id', entityIds);
  }
  const dealIds = [ids.dealA, ids.dealB].filter(Boolean);
  if (dealIds.length) {
    const { error } = await service.from('genz_deals').delete().in('id', dealIds);
    if (error) throw new Error(`Cleanup failed for deals: ${error.message}`);
  }
}

const ids = { dealA: null, dealB: null, offerA: null, offerB: null };
let passed = false;

try {
  const buyerA = await login('buyer A', env.GENZ_E2E_BUYER_A_EMAIL, env.GENZ_E2E_BUYER_A_PASSWORD);
  const buyerB = await login('buyer B', env.GENZ_E2E_BUYER_B_EMAIL, env.GENZ_E2E_BUYER_B_PASSWORD);
  const listing = await login('listing broker', env.GENZ_E2E_LISTING_EMAIL, env.GENZ_E2E_LISTING_PASSWORD);

  assert(buyerA.user.id !== buyerB.user.id, 'Buyer A and Buyer B must be different users');
  assert(listing.user.id !== buyerA.user.id && listing.user.id !== buyerB.user.id, 'Listing broker must be a third user');

  const requirementA = await one(service, 'genz_requirements', env.GENZ_E2E_REQUIREMENT_A_ID, 'id,source_user_id,status');
  const requirementB = await one(service, 'genz_requirements', env.GENZ_E2E_REQUIREMENT_B_ID, 'id,source_user_id,status');
  const property = await one(service, 'genz_properties', env.GENZ_E2E_PROPERTY_ID, 'id,listing_user_id,status');

  assert(requirementA, 'Requirement A fixture not found');
  assert(requirementB, 'Requirement B fixture not found');
  assert(property, 'Property fixture not found');
  assert(requirementA.status === 'active' && requirementB.status === 'active', 'Both fixture requirements must be active');
  assert(property.status === 'active', 'Fixture property must be active');
  assert(requirementA.source_user_id === buyerA.user.id, 'Requirement A is not owned by Buyer A broker');
  assert(requirementB.source_user_id === buyerB.user.id, 'Requirement B is not owned by Buyer B broker');
  assert(property.listing_user_id === listing.user.id, 'Fixture property is not owned by listing broker');

  for (const [requirementId, label] of [[requirementA.id, 'A'], [requirementB.id, 'B']]) {
    const { data, error } = await service
      .from('genz_deals')
      .select('id')
      .eq('requirement_id', requirementId)
      .eq('property_id', property.id)
      .limit(1);
    if (error) throw error;
    assert((data || []).length === 0, `Fixture pair ${label} already has a Deal Room; use clean release fixtures`);
  }

  ids.dealA = await rpc(buyerA.client, 'genz_create_deal_room_v2', {
    p_requirement_id: requirementA.id,
    p_property_id: property.id,
  });
  ids.dealB = await rpc(buyerB.client, 'genz_create_deal_room_v2', {
    p_requirement_id: requirementB.id,
    p_property_id: property.id,
  });
  assert(ids.dealA && ids.dealB && ids.dealA !== ids.dealB, 'Expected two independent Deal Rooms for one property');

  const requestA = randomUUID();
  const requestB = randomUUID();
  const offerA1 = await rpc(buyerA.client, 'genz_make_deal_offer_v2', {
    p_deal_id: ids.dealA,
    p_amount: Number(env.GENZ_E2E_OFFER_A || 4200000),
    p_note: 'GENZ release gate buyer A',
    p_parent_offer_id: null,
    p_valid_hours: 2,
    p_client_request_id: requestA,
  });
  const offerA2 = await rpc(buyerA.client, 'genz_make_deal_offer_v2', {
    p_deal_id: ids.dealA,
    p_amount: Number(env.GENZ_E2E_OFFER_A || 4200000),
    p_note: 'GENZ release gate buyer A retry',
    p_parent_offer_id: null,
    p_valid_hours: 2,
    p_client_request_id: requestA,
  });
  assert(offerA1 === offerA2, 'Offer retry did not return the same id');
  ids.offerA = offerA1;

  ids.offerB = await rpc(buyerB.client, 'genz_make_deal_offer_v2', {
    p_deal_id: ids.dealB,
    p_amount: Number(env.GENZ_E2E_OFFER_B || 4300000),
    p_note: 'GENZ release gate buyer B',
    p_parent_offer_id: null,
    p_valid_hours: 2,
    p_client_request_id: requestB,
  });

  const { data: listingDeals, error: listingDealsError } = await listing.client
    .from('genz_deals').select('id').in('id', [ids.dealA, ids.dealB]);
  if (listingDealsError) throw listingDealsError;
  assert((listingDeals || []).length === 2, 'Listing broker must see both buyer Deal Rooms for the property');

  const { data: listingOffers, error: listingOffersError } = await listing.client
    .from('genz_deal_offers').select('id,deal_id').in('deal_id', [ids.dealA, ids.dealB]);
  if (listingOffersError) throw listingOffersError;
  assert((listingOffers || []).length === 2, 'Listing broker must see offers from both independent Deal Rooms');

  const { data: buyerAOwn, error: buyerAOwnError } = await buyerA.client
    .from('genz_deal_offers').select('id').eq('deal_id', ids.dealA);
  if (buyerAOwnError) throw buyerAOwnError;
  assert((buyerAOwn || []).some((row) => row.id === ids.offerA), 'Buyer A cannot read own Deal Room offer');

  const { data: buyerAForeign, error: buyerAForeignError } = await buyerA.client
    .from('genz_deal_offers').select('id').eq('deal_id', ids.dealB);
  if (buyerAForeignError) throw buyerAForeignError;
  assert((buyerAForeign || []).length === 0, 'PRIVACY FAILURE: Buyer A can read Buyer B offer');

  const { data: buyerBForeign, error: buyerBForeignError } = await buyerB.client
    .from('genz_deal_offers').select('id').eq('deal_id', ids.dealA);
  if (buyerBForeignError) throw buyerBForeignError;
  assert((buyerBForeign || []).length === 0, 'PRIVACY FAILURE: Buyer B can read Buyer A offer');

  const { count: retryCount, error: retryCountError } = await service
    .from('genz_deal_offers')
    .select('*', { count: 'exact', head: true })
    .eq('offered_by_user_id', buyerA.user.id)
    .eq('client_request_id', requestA);
  if (retryCountError) throw retryCountError;
  assert(retryCount === 1, `Idempotency failure: expected one Buyer A offer row, got ${retryCount}`);

  passed = true;
  console.log(JSON.stringify({
    projectRef,
    deals: [ids.dealA, ids.dealB],
    listingBrokerVisibleDealRooms: 2,
    listingBrokerVisibleOffers: 2,
    buyerACrossRoomOffers: 0,
    buyerBCrossRoomOffers: 0,
    repeatedOfferRows: retryCount,
    result: 'PASS',
  }, null, 2));
} finally {
  try {
    await cleanup(ids);
  } catch (error) {
    console.error('GENZ release-gate cleanup error:', error);
    if (passed) process.exitCode = 1;
  }
}
