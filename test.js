/**
 * TVBox 源测试脚本 - 在 GitHub Actions 中运行
 * 无子请求限制，无 KV 限制，可以全量测试
 */
const fs = require('fs');

const SOURCES = [
  'https://cdn.jsdelivr.net/gh/2hacc/TVBox@main/oktv.json',
  'https://raw.githubusercontent.com/qist/tvbox/refs/heads/master/jsm.json',
  'https://raw.githubusercontent.com/gaotianliuyun/gao/master/js.json',
  'https://raw.liucn.cc/box/m.json'
];

const SPIDER = 'https://cdn.jsdelivr.net/gh/2hacc/TVBox@main/jar/tvbox.txt;md5;265301f463ec681dcbba91897f20f08b';

// 排除关键词
const EXCLUDE_RE = /网盘|云盘|Ali|Quark|Thunder|PikPak|UCShare|Samba|115|Push|AList|WebDAV|MIPanSo|KkSs|PanS|YiSo|YpanSo|UuSs|xzso|盘搜|盘他|米盘|抠抠|夸搜|易搜|盘Se|夸克|阿里|PanWeb|Share|分享|云搜|紙條|纸条|Gitcafe|Dovx|Zhaozy|UpYun|弹幕|磁力|p2p/i;

async function fetchSource(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'TVBox-Merger/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  let text = await res.text();
  text = text.replace(/^\uFEFF/, '').replace(/^\s*\/\/.*$/gm, '').trim();
  return JSON.parse(text);
}

function resolveUrl(path, baseUrl) {
  if (!path || !baseUrl) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (!path.startsWith('./') && !path.startsWith('../')) return path;
  const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
  let resolved = path.startsWith('./') ? path.substring(2) : path;
  return baseDir + resolved;
}

function resolveSpider(spider, baseUrl) {
  if (!spider || !baseUrl) return spider;
  const parts = spider.split(';');
  parts[0] = resolveUrl(parts[0], baseUrl);
  return parts.join(';');
}

function extractSourceName(url) {
  const ghMatch = url.match(/\/gh\/([^/]+)\//);
  if (ghMatch) return ghMatch[1];
  const rawMatch = url.match(/githubusercontent\.com\/([^/]+)\//);
  if (rawMatch) return rawMatch[1];
  try { const h = new URL(url).hostname.split('.'); return h[h.length - 2]; } catch (e) { return url.substring(0, 20); }
}

function isUrl(str) { return str && (str.startsWith('http://') || str.startsWith('https://')); }

async function testUrl(url, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const start = Date.now();
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'TVBox-Merger/1.0' }, signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status, latency: Date.now() - start };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, latency: Date.now() - start, error: e.name === 'AbortError' ? 'timeout' : e.message };
  }
}

function extractTestUrl(site, baseUrl) {
  // 跳过 drpy 引擎
  if (site.api && isUrl(site.api) && !site.api.includes('drpy')) return site.api;
  if (site.api && site.api.startsWith('./') && !site.api.includes('drpy') && baseUrl) {
    const r = resolveUrl(site.api, baseUrl);
    if (r) return r;
  }
  if (site.ext && typeof site.ext === 'string') {
    if (isUrl(site.ext)) return site.ext;
    if (site.ext.startsWith('./') && baseUrl) return resolveUrl(site.ext.split('$')[0], baseUrl);
    const m = site.ext.match(/https?:\/\/[^\s$]+/);
    if (m) return m[0].replace(/\$+$/, '').replace(/\/$/, '');
  }
  if (site.ext && typeof site.ext === 'object') {
    if (site.ext.siteUrl && isUrl(site.ext.siteUrl)) return site.ext.siteUrl;
    if (Array.isArray(site.ext.site) && site.ext.site.length > 0 && isUrl(site.ext.site[0])) return site.ext.site[0];
    for (const val of Object.values(site.ext)) {
      if (typeof val === 'string' && isUrl(val)) return val;
      if (Array.isArray(val) && val.length > 0 && isUrl(val[0])) return val[0];
    }
  }
  return '';
}

async function extractRuleHost(jsUrl) {
  try {
    const res = await fetch(jsUrl, { headers: { 'User-Agent': 'TVBox-Merger/1.0' } });
    if (!res.ok) return '';
    const text = await res.text();
    const m = text.match(/host\s*[:=]\s*['"`]([^'"`]+)['"`]/);
    if (m && m[1] && isUrl(m[1])) return m[1].replace(/\/+$/, '');
  } catch (e) {}
  return '';
}

async function main() {
  console.log('开始拉取源...');
  const configs = [];
  const configSources = [];
  for (const url of SOURCES) {
    try {
      const data = await fetchSource(url);
      configs.push(data);
      configSources.push(url);
      console.log(`  ✓ ${extractSourceName(url)}: ${data.sites?.length || 0} sites`);
    } catch (e) {
      console.log(`  ✗ ${extractSourceName(url)}: ${e.message}`);
    }
  }

  // 合并
  const merged = { spider: SPIDER, sites: [], lives: [], parses: [] };
  const seenSites = new Set(), seenLives = new Set(), seenParses = new Set();

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const baseUrl = configSources[i];
    const sourceSpider = resolveSpider(config.spider || '', baseUrl);

    if (Array.isArray(config.sites)) {
      for (const site of config.sites) {
        const key = site.key || site.name;
        if (!key || seenSites.has(key)) continue;
        seenSites.add(key);
        merged.sites.push({ ...site, _baseUrl: baseUrl, _spider: sourceSpider, _source: extractSourceName(baseUrl) });
      }
    }
    if (Array.isArray(config.lives)) {
      for (const live of config.lives) {
        const k = `${live.name}|${live.url}`;
        if (!seenLives.has(k)) { seenLives.add(k); merged.lives.push(live); }
      }
    }
    if (Array.isArray(config.parses)) {
      for (const parse of config.parses) {
        const k = parse.name || parse.url;
        if (k && !seenParses.has(k)) { seenParses.add(k); merged.parses.push(parse); }
      }
    }
  }

  console.log(`\n合并完成: ${merged.sites.length} sites, ${merged.lives.length} lives, ${merged.parses.length} parses`);

  // 测试 spider
  console.log('\n测试 Spider...');
  const spiders = [...new Set(configs.map(c => resolveSpider(c.spider || '', configSources[configs.indexOf(c)])).filter(Boolean))];
  const deadSpiders = new Set();
  for (const spider of spiders) {
    const url = spider.split(';')[0];
    const r = await testUrl(url);
    const status = r.ok ? '✓' : '✗';
    console.log(`  ${status} ${url.substring(url.lastIndexOf('/') + 1)} (${r.status}, ${r.latency}ms)`);
    if (!r.ok) deadSpiders.add(spider);
  }

  // 测试站点
  console.log(`\n测试站点 (${merged.sites.length} 个)...`);
  const results = {};
  let tested = 0, alive = 0;

  for (const site of merged.sites) {
    const key = site.key || site.name;
    let testUrlStr = extractTestUrl(site, site._baseUrl);

    // drpy 类站点尝试提取 rule host
    if (!testUrlStr && site.api && site.api.includes('drpy') && site.ext) {
      let jsUrl = '';
      if (typeof site.ext === 'string') {
        if (isUrl(site.ext)) jsUrl = site.ext.split('$')[0];
        else if (site.ext.startsWith('./')) jsUrl = resolveUrl(site.ext.split('$')[0], site._baseUrl);
      }
      if (jsUrl && jsUrl.endsWith('.js')) {
        testUrlStr = await extractRuleHost(jsUrl);
      }
    }

    if (!testUrlStr) {
      results[key] = { status: 'skip' };
      continue;
    }

    const r = await testUrl(testUrlStr);
    tested++;
    if (r.ok) alive++;
    results[key] = { status: r.ok ? 'ok' : 'fail', http: r.status, latency: r.latency, url: testUrlStr, error: r.error };
  }

  console.log(`  测试完成: ${tested} 测试, ${alive} 存活`);

  // 测试 lives
  console.log('\n测试直播源...');
  const liveResults = {};
  for (const live of merged.lives) {
    if (!live.url || !isUrl(live.url)) continue;
    const r = await testUrl(live.url);
    liveResults[`${live.name}|${live.url}`] = r.ok;
    console.log(`  ${r.ok ? '✓' : '✗'} ${live.name} (${r.status})`);
  }

  // 测试 parses
  console.log('\n测试解析接口...');
  const parseResults = {};
  for (const parse of merged.parses) {
    if (!parse.url || !isUrl(parse.url)) continue;
    const r = await testUrl(parse.url);
    parseResults[parse.name || parse.url] = r.ok;
    console.log(`  ${r.ok ? '✓' : '✗'} ${parse.name} (${r.status})`);
  }

  // 生成 alive.json
  console.log('\n生成 alive.json...');
  const aliveSites = merged.sites.filter(site => {
    const key = site.key || site.name;
    const name = site.name || '';

    // 排除网盘/弹幕/磁力
    if (EXCLUDE_RE.test(key) || EXCLUDE_RE.test(name) || EXCLUDE_RE.test(site.api || '')) return false;
    // 排除 dead spider 的站点
    if (site.type === 3 && site._spider && deadSpiders.has(site._spider)) return false;
    // 排除测试失败的
    const r = results[key];
    if (r && r.status === 'fail') return false;

    return true;
  }).map(site => {
    const { _baseUrl, _spider, _source, ...clean } = site;
    // 转换相对路径
    if (_baseUrl) {
      if (clean.api && clean.api.startsWith('./')) clean.api = resolveUrl(clean.api, _baseUrl);
      if (clean.ext && typeof clean.ext === 'string' && clean.ext.startsWith('./')) clean.ext = resolveUrl(clean.ext, _baseUrl);
    }
    return clean;
  });

  const aliveLives = merged.lives.filter(l => {
    const k = `${l.name}|${l.url}`;
    if (liveResults.hasOwnProperty(k)) return liveResults[k];
    return true;
  });

  const aliveParses = merged.parses.filter(p => {
    const k = p.name || p.url;
    if (parseResults.hasOwnProperty(k)) return parseResults[k];
    return true;
  });

  const output = { spider: SPIDER, sites: aliveSites, lives: aliveLives, parses: aliveParses };

  fs.writeFileSync('alive.json', JSON.stringify(output, null, 2));
  fs.writeFileSync('results.json', JSON.stringify({ tested_at: new Date().toISOString(), sites: results, spiders: Object.fromEntries(spiders.map(s => [s, !deadSpiders.has(s)])) }, null, 2));

  console.log(`\n完成! alive.json: ${aliveSites.length} sites, ${aliveLives.length} lives, ${aliveParses.length} parses`);
}

main().catch(e => { console.error(e); process.exit(1); });
