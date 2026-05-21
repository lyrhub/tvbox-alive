/**
 * TVBox 源测试脚本 - 在 GitHub Actions 中运行
 * 无子请求限制，无 KV 限制，可以全量测试
 * 
 * 改进：对 .js/.json/.txt 等文本文件，下载后提取真实站点地址进行测试
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

// 文本文件后缀 - 这些是规则/配置文件，不是真实站点
const TEXT_FILE_RE = /\.(js|json|txt|py|jar|zip|md|html|css|xml|yaml|yml|conf|cfg|properties|toml)(\?.*)?$/i;

// 代码托管平台域名 - 这些域名上的文件不需要测试连通性
const CODE_HOST_RE = /^https?:\/\/(raw\.githubusercontent\.com|cdn\.jsdelivr\.net|github\.com|gitee\.com|raw\.gitee\.com|gist\.githubusercontent\.com|raw\.gitmirror\.com|ghproxy\.com|mirror\.ghproxy\.com|gh-proxy\.com|raw\.kkgithub\.com|fastly\.jsdelivr\.net|gcore\.jsdelivr\.net|testingcf\.jsdelivr\.net)/i;

async function fetchSource(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'TVBox-Alive/1.0' } });
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

/**
 * 判断 URL 是否指向文本/代码文件（而非真实站点）
 */
function isTextFileUrl(url) {
  if (!url) return false;
  // 代码托管平台上的文件
  if (CODE_HOST_RE.test(url)) return true;
  // 文本文件后缀
  const pathname = url.split('?')[0].split('#')[0];
  if (TEXT_FILE_RE.test(pathname)) return true;
  return false;
}

/**
 * 从文本内容中提取真实站点地址
 * 支持 JS 规则文件、JSON 配置文件、Python 爬虫等
 */
function extractHostFromContent(text) {
  // 1. 匹配 host = "xxx" 或 host: "xxx" 模式（drpy 规则文件最常见）
  //    支持 var host = 'xxx', let host = 'xxx', const host = 'xxx', host = 'xxx'
  const hostPatterns = [
    /(?:var|let|const|)\s*host\s*[:=]\s*['"`]([^'"`\s]+)['"`]/,
    /['"]host['"]\s*[:=]\s*['"`]([^'"`\s]+)['"`]/,
    /this\.host\s*=\s*['"`]([^'"`\s]+)['"`]/,
  ];
  for (const pattern of hostPatterns) {
    const m = text.match(pattern);
    if (m && m[1] && isUrl(m[1])) {
      return m[1].replace(/\/+$/, '');
    }
  }

  // 2. 匹配 homeUrl / siteUrl / baseUrl 等
  const urlPatterns = [
    /(?:var|let|const|)\s*(?:homeUrl|siteUrl|baseUrl|base_url|site_url|host_url|url)\s*[:=]\s*['"`]([^'"`\s]+)['"`]/,
    /['"](?:homeUrl|siteUrl|baseUrl|url)['"]\s*[:=]\s*['"`]([^'"`\s]+)['"`]/,
  ];
  for (const pattern of urlPatterns) {
    const m = text.match(pattern);
    if (m && m[1] && isUrl(m[1]) && !CODE_HOST_RE.test(m[1])) {
      return m[1].replace(/\/+$/, '');
    }
  }

  // 3. Python 爬虫: host = "xxx"
  const pyHost = text.match(/host\s*=\s*['"]([^'"]+)['"]/);
  if (pyHost && pyHost[1] && isUrl(pyHost[1])) {
    return pyHost[1].replace(/\/+$/, '');
  }

  // 4. 匹配 JSON 中的 host/url 字段
  try {
    const json = JSON.parse(text);
    if (json.host && isUrl(json.host)) return json.host.replace(/\/+$/, '');
    if (json.url && isUrl(json.url) && !CODE_HOST_RE.test(json.url)) return json.url.replace(/\/+$/, '');
    if (json.baseUrl && isUrl(json.baseUrl) && !CODE_HOST_RE.test(json.baseUrl)) return json.baseUrl.replace(/\/+$/, '');
    if (json.siteUrl && isUrl(json.siteUrl)) return json.siteUrl.replace(/\/+$/, '');
    if (json.homeUrl && isUrl(json.homeUrl)) return json.homeUrl.replace(/\/+$/, '');
    // 如果是数组，取第一个有 host/url 的
    if (Array.isArray(json)) {
      for (const item of json) {
        if (item && item.host && isUrl(item.host)) return item.host.replace(/\/+$/, '');
        if (item && item.url && isUrl(item.url) && !CODE_HOST_RE.test(item.url)) return item.url.replace(/\/+$/, '');
      }
    }
  } catch (e) {}

  // 5. 从内容中找第一个非代码托管的 http URL（作为最后手段）
  const allUrls = text.match(/https?:\/\/[^\s'"`<>\]\)},\\]+/g);
  if (allUrls) {
    for (const u of allUrls) {
      const cleaned = u.replace(/['"`;,\]\)]+$/, '').replace(/\/+$/, '');
      if (!CODE_HOST_RE.test(cleaned) && !TEXT_FILE_RE.test(cleaned) && cleaned.length > 10) {
        // 尝试只取域名部分（避免带路径模板的 URL）
        try {
          const parsed = new URL(cleaned);
          const base = parsed.origin;
          // 如果路径中有模板变量如 {cateId}，只用域名
          if (cleaned.includes('{') || cleaned.includes('$')) return base;
          return cleaned;
        } catch (e) {}
        return cleaned;
      }
    }
  }

  return '';
}

/**
 * 下载文本文件并提取真实站点地址
 */
async function fetchRealHost(textUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(textUrl, { 
      headers: { 'User-Agent': 'TVBox-Alive/1.0' }, 
      signal: controller.signal 
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    const text = await res.text();
    return extractHostFromContent(text);
  } catch (e) {
    return '';
  }
}

async function testUrl(url, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const start = Date.now();
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'TVBox-Alive/1.0' }, signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status, latency: Date.now() - start };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, latency: Date.now() - start, error: e.name === 'AbortError' ? 'timeout' : e.message };
  }
}

/**
 * 判断 URL 是否是 drpy 引擎文件（不应从中提取 host）
 */
function isDrpyEngine(url) {
  if (!url) return false;
  return /drpy\d?\.min\.js|drpy\d?\.js|lib\/drpy/i.test(url);
}

/**
 * 从站点配置中提取初始测试 URL（可能是文本文件）
 * 对 drpy 类站点，优先从 ext（规则文件）中提取，而非 api（引擎文件）
 */
function extractRawTestUrl(site, baseUrl) {
  const api = site.api || '';
  const isDrpy = isDrpyEngine(api) || api.includes('drpy');

  // 对 drpy 类站点，优先用 ext（规则 js 文件）
  if (isDrpy) {
    const extUrl = getExtUrl(site, baseUrl);
    if (extUrl) return extUrl;
    // drpy 引擎文件本身不作为测试目标
    return '';
  }

  // 非 drpy 站点：api 字段
  if (api && isUrl(api)) return api;
  if (api && api.startsWith('./') && baseUrl) {
    const r = resolveUrl(api, baseUrl);
    if (r) return r;
  }

  // ext
  const extUrl = getExtUrl(site, baseUrl);
  if (extUrl) return extUrl;

  return '';
}

/**
 * 从 ext 字段提取 URL
 */
function getExtUrl(site, baseUrl) {
  if (site.ext && typeof site.ext === 'string') {
    const first = site.ext.split('\n')[0].trim();
    if (isUrl(first)) return first;
    if (first.startsWith('./') && baseUrl) return resolveUrl(first, baseUrl);
    const m = site.ext.match(/https?:\/\/[^\s$]+/);
    if (m) return m[0].replace(/\$+$/, '').replace(/\/$/, '');
  }

  if (site.ext && typeof site.ext === 'object') {
    if (site.ext.siteUrl && isUrl(site.ext.siteUrl)) return site.ext.siteUrl;
    if (Array.isArray(site.ext.site) && site.ext.site.length > 0 && isUrl(site.ext.site[0])) return site.ext.site[0];
    for (const val of Object.values(site.ext)) {
      if (typeof val === 'string' && isUrl(val)) return val;
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string' && isUrl(val[0])) return val[0];
    }
  }

  return '';
}

/**
 * 获取站点的真实测试地址
 * 如果原始 URL 是文本文件，则下载并提取真实 host
 */
async function getRealTestUrl(site, baseUrl) {
  const rawUrl = extractRawTestUrl(site, baseUrl);
  if (!rawUrl) return { url: '', source: 'none', resolved: false };

  // 如果不是文本文件 URL，直接用
  if (!isTextFileUrl(rawUrl)) {
    return { url: rawUrl, source: 'direct', resolved: false };
  }

  // 是文本文件，下载并提取真实地址
  const realHost = await fetchRealHost(rawUrl);
  if (realHost && !isTextFileUrl(realHost)) {
    return { url: realHost, source: 'extracted', resolved: true, from: rawUrl };
  }

  // 提取失败，但如果 ext 中有 siteUrl 或 site 数组中有非文本 URL，用那个
  if (site.ext && typeof site.ext === 'object') {
    if (site.ext.siteUrl && isUrl(site.ext.siteUrl) && !isTextFileUrl(site.ext.siteUrl)) {
      return { url: site.ext.siteUrl, source: 'ext.siteUrl', resolved: false };
    }
    if (Array.isArray(site.ext.site)) {
      const realSite = site.ext.site.find(u => isUrl(u) && !isTextFileUrl(u));
      if (realSite) return { url: realSite, source: 'ext.site[]', resolved: false };
    }
  }

  // 实在找不到真实地址，跳过（不测试文本文件本身）
  return { url: '', source: 'text_file_no_host', resolved: false, from: rawUrl };
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
  let tested = 0, alive = 0, resolved = 0;

  // 并发控制：每批 10 个
  const CONCURRENCY = 10;
  const sites = merged.sites;

  for (let i = 0; i < sites.length; i += CONCURRENCY) {
    const batch = sites.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(batch.map(async (site) => {
      const key = site.key || site.name;
      const { url: testUrlStr, source, resolved: wasResolved, from } = await getRealTestUrl(site, site._baseUrl);

      if (!testUrlStr) {
        return { key, result: { status: 'skip', reason: source, from } };
      }

      const r = await testUrl(testUrlStr);
      return {
        key,
        result: {
          status: r.ok ? 'ok' : 'fail',
          http: r.status,
          latency: r.latency,
          url: testUrlStr,
          source,
          resolved: wasResolved,
          from: wasResolved ? from : undefined,
          error: r.error
        }
      };
    }));

    for (const br of batchResults) {
      if (br.status === 'fulfilled') {
        const { key, result } = br.value;
        results[key] = result;
        if (result.status !== 'skip') tested++;
        if (result.status === 'ok') alive++;
        if (result.resolved) resolved++;
      }
    }

    // 进度
    const progress = Math.min(i + CONCURRENCY, sites.length);
    if (progress % 50 === 0 || progress === sites.length) {
      console.log(`  进度: ${progress}/${sites.length} (存活: ${alive}/${tested}, 解析host: ${resolved})`);
    }
  }

  console.log(`  测试完成: ${tested} 测试, ${alive} 存活, ${resolved} 个从文件中提取了真实地址`);

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
  fs.writeFileSync('results.json', JSON.stringify({
    tested_at: new Date().toISOString(),
    summary: { total: sites.length, tested, alive, resolved, skipped: sites.length - tested },
    sites: results,
    spiders: Object.fromEntries(spiders.map(s => [s, !deadSpiders.has(s)]))
  }, null, 2));

  console.log(`\n完成! alive.json: ${aliveSites.length} sites, ${aliveLives.length} lives, ${aliveParses.length} parses`);
}

main().catch(e => { console.error(e); process.exit(1); });
