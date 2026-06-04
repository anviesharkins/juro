const express = require('express');
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const ROBLOSECURITY = process.env.ROBLOSECURITY || '';

app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

function extractAssetId(input) {
  const text = String(input || '').trim();
  const match = text.match(/(?:asset|library|catalog)\/(\d+)|[?&]id=(\d+)|^\d+$/i);
  if (!match) return null;
  return match[1] || match[2] || text;
}

function buildCookieHeader() {
  const raw = String(ROBLOSECURITY || '').trim();
  if (!raw) return null;

  // Aceita tanto o valor puro do cookie quanto ".ROBLOSECURITY=valor".
  if (raw.includes('.ROBLOSECURITY=')) return raw;
  return `.ROBLOSECURITY=${raw}`;
}

function robloxIdFromValue(value) {
  if (!value) return null;
  const text = String(value);
  const match = text.match(/(?:rbxassetid:\/\/|id=|asset\/?)(\d+)/i) || text.match(/^(\d+)$/);
  return match ? match[1] : null;
}

function propText(prop) {
  if (prop == null) return '';
  if (typeof prop === 'string' || typeof prop === 'number') return String(prop);
  if (typeof prop === 'object') return String(prop['#text'] || prop.value || '');
  return '';
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getNameAndRefs(item) {
  const props = item.Properties || {};
  const name = propText(props.string?.find ? props.string.find(p => p?.['@_name'] === 'Name') : normalizeArray(props.string).find(p => p?.['@_name'] === 'Name'));
  return name || item['@_class'] || 'Item';
}

const assetProps = new Set([
  'MeshId', 'TextureID', 'TextureId', 'Texture', 'SoundId', 'AnimationId', 'Image',
  'Video', 'LinkedSource', 'Graphic', 'PantsTemplate', 'ShirtTemplate', 'Face', 'BodyPart'
]);

function collectProps(props) {
  const found = [];
  if (!props || typeof props !== 'object') return found;
  for (const raw of Object.values(props)) {
    for (const prop of normalizeArray(raw)) {
      if (!prop || typeof prop !== 'object') continue;
      const propName = prop['@_name'];
      if (!assetProps.has(propName)) continue;
      const value = propText(prop);
      const id = robloxIdFromValue(value);
      if (id) found.push({ property: propName, value, id });
    }
  }
  return found;
}

function walkItems(rawItems, parentPath = '') {
  const out = [];
  for (const item of normalizeArray(rawItems)) {
    if (!item || typeof item !== 'object') continue;
    const className = item['@_class'] || 'Unknown';
    const name = getNameAndRefs(item);
    const path = parentPath ? `${parentPath}/${name}` : name;
    const refs = collectProps(item.Properties);
    out.push({ name, className, path, refs, childrenCount: normalizeArray(item.Item).length });
    out.push(...walkItems(item.Item, path));
  }
  return out;
}

async function getAssetDetails(assetId) {
  try {
    const { data } = await axios.get('https://economy.roblox.com/v2/assets/' + assetId + '/details', { timeout: 12000 });
    return data;
  } catch (_) {
    return null;
  }
}

async function getThumbnails(ids) {
  const unique = [...new Set(ids)].slice(0, 100);
  if (!unique.length) return {};
  try {
    const { data } = await axios.get('https://thumbnails.roblox.com/v1/assets', {
      params: { assetIds: unique.join(','), size: '150x150', format: 'Png', isCircular: false },
      timeout: 12000
    });
    const map = {};
    for (const item of data?.data || []) map[String(item.targetId)] = item.imageUrl || null;
    return map;
  } catch (_) {
    return {};
  }
}

async function downloadAsset(assetId) {
  const headers = { 'User-Agent': 'RobloxAssetScanner/1.0' };
  const cookie = buildCookieHeader();
  if (cookie) headers.Cookie = cookie;

  const urls = [
    `https://assetdelivery.roblox.com/v1/asset?id=${assetId}`,
    `https://assetdelivery.roblox.com/v2/asset/?id=${assetId}`
  ];

  let lastError = 'Não consegui baixar o asset.';
  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        maxRedirects: 5,
        validateStatus: () => true,
        headers,
        timeout: 20000
      });
      if (res.status >= 200 && res.status < 300) {
        const buffer = Buffer.from(res.data);
        const text = buffer.toString('utf8');
        return { buffer, text, contentType: res.headers['content-type'] || '' };
      }
      lastError = `Roblox respondeu HTTP ${res.status}.`;
    } catch (err) {
      lastError = err.message;
    }
  }
  throw new Error(lastError);
}

function parseRbxmx(text) {
  const cleaned = text.replace(/^\uFEFF/, '');
  if (!cleaned.includes('<roblox')) {
    throw new Error('O asset baixou, mas não veio em XML/RBXMX. Provavelmente veio RBXM binário.');
  }
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });
  const root = parser.parse(cleaned);
  const items = walkItems(root?.roblox?.Item || []);
  return items;
}

app.get('/api/scan', async (req, res) => {
  const assetId = extractAssetId(req.query.url || req.query.assetId || req.query.id);
  if (!assetId) return res.status(400).json({ error: 'Mande um link ou ID de asset válido.' });

  try {
    const [details, asset] = await Promise.all([getAssetDetails(assetId), downloadAsset(assetId)]);
    const tree = parseRbxmx(asset.text);
    const refIds = tree.flatMap(item => item.refs.map(ref => ref.id));
    const thumbs = await getThumbnails([assetId, ...refIds]);

    const items = tree.map(item => ({
      ...item,
      refs: item.refs.map(ref => ({ ...ref, thumbnail: thumbs[ref.id] || null, assetUrl: `https://create.roblox.com/store/asset/${ref.id}` }))
    }));

    res.json({
      assetId,
      name: details?.Name || details?.name || null,
      creator: details?.Creator?.Name || details?.creator?.name || null,
      thumbnail: thumbs[assetId] || null,
      totalItems: items.length,
      totalAssetRefs: refIds.length,
      items
    });
  } catch (err) {
    res.status(422).json({
      error: err.message,
      help: 'Se aparecer RBXM binário, este MVP ainda precisa de parser binário. Se aparecer 401/403, confira se ROBLOSECURITY está certo no Railway e faça redeploy.'
    });
  }
});

app.listen(PORT, () => console.log(`Scanner aberto na porta ${PORT}`));
