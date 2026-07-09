const axios = require('axios');
const db = require('../config/db');

// Always pulls the latest URL/API key from DB settings (Admin > Settings can change these live)
async function getClient() {
  const [rows] = await db.query('SELECT panel_url, panel_api_key FROM settings WHERE id = 1');
  const s = rows[0] || {};
  const baseURL = (s.panel_url || process.env.PANEL_URL || '').replace(/\/$/, '');
  const apiKey = s.panel_api_key || process.env.PANEL_API_KEY || '';

  return axios.create({
    baseURL: `${baseURL}/api/application`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    validateStatus: () => true
  });
}

async function getPanelUrl() {
  const [rows] = await db.query('SELECT panel_url FROM settings WHERE id = 1');
  return (rows[0] && rows[0].panel_url) || process.env.PANEL_URL || '';
}

// Create a user on the Pterodactyl panel (same email/username/password as dashboard signup)
async function createPteroUser({ email, username, password, first_name, last_name }) {
  const client = await getClient();
  const res = await client.post('/users', {
    email,
    username,
    first_name: first_name || username,
    last_name: last_name || 'User',
    password
  });
  if (res.status === 201) return res.data.attributes;
  // If user already exists on panel (409), try to find and return it
  if (res.status === 422 || res.status === 409) {
    const search = await client.get(`/users?filter[email]=${encodeURIComponent(email)}`);
    if (search.data && search.data.data && search.data.data.length) {
      return search.data.data[0].attributes;
    }
  }
  throw new Error('Ptero create user failed: ' + JSON.stringify(res.data));
}

async function deletePteroUser(pteroUserId) {
  const client = await getClient();
  await client.delete(`/users/${pteroUserId}`);
}

async function getEgg(nestId, eggId) {
  const client = await getClient();
  const res = await client.get(`/nests/${nestId}/eggs/${eggId}?include=variables`);
  if (res.status !== 200) throw new Error('Egg fetch failed: ' + JSON.stringify(res.data));
  return res.data.attributes;
}

// Create a server for a user based on a plan
async function createServer({ name, pteroUserId, plan, locationId, nestId, eggId }) {
  const client = await getClient();
  const egg = await getEgg(nestId, eggId);

  const environment = {};
  (egg.relationships?.variables?.data || []).forEach(v => {
    environment[v.attributes.env_variable] = v.attributes.default_value;
  });

  const payload = {
    name,
    user: pteroUserId,
    egg: eggId,
    docker_image: egg.docker_image,
    startup: egg.startup,
    environment,
    limits: {
      memory: plan.ram,
      swap: 0,
      disk: plan.disk,
      io: 500,
      cpu: plan.cpu
    },
    feature_limits: {
      databases: 1,
      allocations: plan.allocations,
      backups: plan.backups
    },
    deploy: {
      locations: [locationId],
      dedicated_ip: false,
      port_range: []
    }
  };

  const res = await client.post('/servers', payload);
  if (res.status !== 201) throw new Error('Ptero create server failed: ' + JSON.stringify(res.data));
  return res.data.attributes;
}

async function deleteServer(pteroServerId, force = true) {
  const client = await getClient();
  await client.delete(`/servers/${pteroServerId}${force ? '/force' : ''}`);
}

async function suspendServer(pteroServerId) {
  const client = await getClient();
  await client.post(`/servers/${pteroServerId}/suspend`);
}

async function unsuspendServer(pteroServerId) {
  const client = await getClient();
  await client.post(`/servers/${pteroServerId}/unsuspend`);
}

// Update server build/resources (used for renew/upgrade or admin edit)
async function updateServerBuild(pteroServerId, plan, allocationId) {
  const client = await getClient();
  const res = await client.patch(`/servers/${pteroServerId}/build`, {
    allocation: allocationId,
    memory: plan.ram,
    swap: 0,
    disk: plan.disk,
    io: 500,
    cpu: plan.cpu,
    feature_limits: { databases: 1, allocations: plan.allocations, backups: plan.backups }
  });
  if (res.status !== 200) throw new Error('Ptero update build failed: ' + JSON.stringify(res.data));
  return res.data.attributes;
}

// Move / transfer a server to a different node/location
async function moveServer(pteroServerId, locationId) {
  const client = await getClient();
  const res = await client.post(`/servers/${pteroServerId}/transfer`, {
    location_id: locationId
  });
  if (![200, 202, 204].includes(res.status)) {
    throw new Error('Ptero move/transfer failed: ' + JSON.stringify(res.data));
  }
  return true;
}

async function getServerDetails(pteroServerId) {
  const client = await getClient();
  const res = await client.get(`/servers/${pteroServerId}`);
  if (res.status !== 200) throw new Error('Ptero get server failed: ' + JSON.stringify(res.data));
  return res.data.attributes;
}

async function listNests() {
  const client = await getClient();
  const res = await client.get('/nests?include=eggs');
  return res.data.data || [];
}

async function listLocations() {
  const client = await getClient();
  const res = await client.get('/locations');
  return res.data.data || [];
}

module.exports = {
  getPanelUrl,
  createPteroUser,
  deletePteroUser,
  getEgg,
  createServer,
  deleteServer,
  suspendServer,
  unsuspendServer,
  updateServerBuild,
  moveServer,
  getServerDetails,
  listNests,
  listLocations
};
