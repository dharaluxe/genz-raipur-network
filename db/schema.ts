import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const members = sqliteTable('members', {
 id:text('id').primaryKey(),email:text('email').notNull().unique(),name:text('name').notNull(),firm:text('firm').notNull().default(''),phone:text('phone').notNull().default(''),area:text('area').notNull().default('Raipur'),role:text('role').notNull().default('broker'),status:text('status').notNull().default('pending'),brokerId:text('broker_id').notNull().unique(),createdAt:text('created_at').notNull(),verifiedAt:text('verified_at'),
});
export const invites = sqliteTable('invites',{id:text('id').primaryKey(),email:text('email').notNull(),name:text('name').notNull(),tokenHash:text('token_hash').notNull().unique(),expires:text('expires').notNull(),usedBy:text('used_by'),createdBy:text('created_by').notNull(),createdAt:text('created_at').notNull()});
export const records = sqliteTable('records',{
 id:text('id').primaryKey(),kind:text('kind').notNull(),ownerId:text('owner_id').notNull(),partnerId:text('partner_id'),status:text('status').notNull(),uniqueKey:text('unique_key').unique(),data:text('data').notNull(),revision:integer('revision').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('idx_records_kind_owner').on(t.kind,t.ownerId),index('idx_records_partner').on(t.partnerId)]);
export const audits = sqliteTable('audits',{id:text('id').primaryKey(),actorId:text('actor_id').notNull(),action:text('action').notNull(),recordId:text('record_id').notNull(),detail:text('detail').notNull(),createdAt:text('created_at').notNull()});
export const files = sqliteTable('files',{id:text('id').primaryKey(),recordId:text('record_id').notNull(),ownerId:text('owner_id').notNull(),name:text('name').notNull(),mime:text('mime').notNull(),size:integer('size').notNull(),createdAt:text('created_at').notNull()},t=>[index('idx_files_record').on(t.recordId)]);
export const settings = sqliteTable('settings',{key:text('key').primaryKey(),value:text('value').notNull()});
export const rateLimits = sqliteTable('rate_limits',{key:text('key').primaryKey(),window:integer('window').notNull(),hits:integer('hits').notNull()});
