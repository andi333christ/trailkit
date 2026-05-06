/**
 * rideStore.js — IndexedDB abstraction layer (via Dexie.js).
 */

import Dexie from 'dexie'

const DB_NAME = 'trailkit'
const STORE_RIDES = 'rides'
const STORE_PREFS = 'preferences'
const STORE_PLANS = 'plans'

let _db = null

function getDB() {
  if (!_db) {
    _db = new Dexie(DB_NAME)
    _db.version(1).stores({
      [STORE_RIDES]: '++id, routeId, riddenAt, bikeType, rating',
      [STORE_PREFS]: 'key',
    })
    // Version 2: add plans table
    _db.version(2).stores({
      [STORE_RIDES]: '++id, routeId, riddenAt, bikeType, rating',
      [STORE_PREFS]: 'key',
      [STORE_PLANS]: '++id, name, createdAt',
    })
  }
  return _db
}

// ── Rides ──────────────────────────────────────────────────────────────────

export async function addRide(ride) {
  const db = getDB()
  return db[STORE_RIDES].add({ ...ride, createdAt: new Date().toISOString() })
}

export async function updateRide(id, changes) {
  const db = getDB()
  return db[STORE_RIDES].update(id, changes)
}

export async function deleteRide(id) {
  const db = getDB()
  return db[STORE_RIDES].delete(id)
}

export async function getAllRides() {
  const db = getDB()
  return db[STORE_RIDES].orderBy('riddenAt').reverse().toArray()
}

export async function getRidesForRoute(routeId) {
  const db = getDB()
  return db[STORE_RIDES].where('routeId').equals(routeId).reverse().toArray()
}

export async function getRiddenRouteIds() {
  const db = getDB()
  const rides = await db[STORE_RIDES].toArray()
  return new Set(rides.map((r) => r.routeId))
}

export async function getRideCount() {
  const db = getDB()
  return db[STORE_RIDES].count()
}

// ── Plans ─────────────────────────────────────────────────────────────────

export async function addPlan(plan) {
  const db = getDB()
  const { elevationProfile, ...rest } = plan
  return db[STORE_PLANS].add({
    ...rest,
    elevationProfileJson: elevationProfile ? JSON.stringify(elevationProfile) : null,
    createdAt: new Date().toISOString(),
  })
}

export async function updatePlan(id, changes) {
  const db = getDB()
  return db[STORE_PLANS].update(id, changes)
}

export async function deletePlan(id) {
  const db = getDB()
  return db[STORE_PLANS].delete(id)
}

export async function getAllPlans() {
  const db = getDB()
  const plans = await db[STORE_PLANS].orderBy('createdAt').reverse().toArray()
  return plans.map((p) => ({
    ...p,
    elevationProfile: p.elevationProfileJson ? JSON.parse(p.elevationProfileJson) : null,
  }))
}

// ── Preferences ─────────────────────────────────────────────────────────────

export async function getPref(key, defaultValue = null) {
  const db = getDB()
  const row = await db[STORE_PREFS].get(key)
  return row?.value ?? defaultValue
}

export async function setPref(key, value) {
  const db = getDB()
  return db[STORE_PREFS].put({ key, value })
}

// ── Import / Export ───────────────────────────────────────────────────────────

export async function exportAllData() {
  const db = getDB()
  const [rides, plans, prefs] = await Promise.all([
    db[STORE_RIDES].toArray(),
    db[STORE_PLANS].toArray(),
    db[STORE_PREFS].toArray(),
  ])
  return {
    version: 2,
    app: 'trailkit',
    exported_at: new Date().toISOString(),
    rides,
    plans,
    preferences: Object.fromEntries(prefs.map((p) => [p.key, p.value])),
  }
}

export async function importData(data) {
  if (!data || data.app !== 'trailkit') throw new Error('Invalid import format')
  const db = getDB()
  await Promise.all([
    db[STORE_RIDES].clear(),
    db[STORE_PLANS].clear(),
    db[STORE_PREFS].clear(),
  ])
  if (data.rides?.length) await db[STORE_RIDES].bulkAdd(data.rides)
  if (data.plans?.length) await db[STORE_PLANS].bulkAdd(data.plans)
  if (data.preferences) {
    for (const [key, value] of Object.entries(data.preferences)) {
      await db[STORE_PREFS].put({ key, value })
    }
  }
}