/**
 * 生成 GitHub Pages 静态文件
 * 读取 test.js 产出的 alive.json 和 results.json，生成状态页面
 */
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = 'output';

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// 复制 alive.json 到输出目录
if (fs.existsSync('alive.json')) {
  fs.copyFileSync('alive.json', path.join(OUTPUT_DIR, 'alive.json'));
  fs.copyFileSync('alive.json', path.join(OUTPUT_DIR, 'index.json'));
}

// 复制 results.json
if (fs.existsSync('results.json')) {
  fs.copyFileSync('results.json', path.join(OUTPUT_DIR, 'results.json'));
}

// 读取数据生成页面
let aliveData = null, resultsData = null;
try { aliveData = JSON.parse(fs.readFileSync('alive.json', 'utf-8')); } catch (e) {}
try { resultsData = JSON.parse(fs.readFileSync('results.json', 'utf-8')); } catch (e) {}

// 生成状态页面 (index.html)
function generateStatusPage() {
  // results.json 现在是 TVBox 源格式，站点名称中含状态标记如 [✓ 123ms]
  const allSites = resultsData?.sites || [];
  const allLives = resultsData?.lives || [];
  const allParses = resultsData?.parses || [];
  const testedAt = new Date().toISOString();

  // 从站点名称中解析状态
  const parsedSites = allSites.map(site => {
    const nameMatch = (site.name || '').match(/^\[(✓|✗|⊘|❓)\s*(\d+ms)?\]\s*(.*)$/);
    let status = 'skip', latency = null, displayName = site.name || site.key || '';
    if (nameMatch) {
      const tag = nameMatch[1];
      if (tag === '✓') status = 'ok';
      else if (tag === '✗') status = 'fail';
      else if (tag === '⊘') status = 'skip';
      latency = nameMatch[2] ? parseInt(nameMatch[2]) : null;
      displayName = nameMatch[3];
    }
    return { key: site.key || displayName, name: displayName, status, latency };
  });

  const okCount = parsedSites.filter(s => s.status === 'ok').length;
  const failCount = parsedSites.filter(s => s.status === 'fail').length;
  const skipCount = parsedSites.filter(s => s.status === 'skip').length;
  const totalTested = parsedSites.length;

  const aliveSites = aliveData?.sites?.length || 0;
  const aliveLives = aliveData?.lives?.length || 0;
  const aliveParses = aliveData?.parses?.length || 0;

  // 直播源状态
  const liveRows = allLives.map(l => {
    const nameMatch = (l.name || '').match(/^\[(✓|✗)\]\s*(.*)$/);
    const ok = nameMatch ? nameMatch[1] === '✓' : false;
    const displayName = nameMatch ? nameMatch[2] : (l.name || '未知');
    const url = l.url || '';
    const dot = ok ? 'dot-ok' : 'dot-fail';
    const note = ok ? '<span style="color:#3fb950">可用</span>' : '<span class="error-text">不可用</span>';
    return `<tr><td><span class="dot ${dot}"></span></td><td class="site-name">📺 ${displayName}</td><td class="api-url" title="${url}">${url || '--'}</td><td>${note}</td></tr>`;
  }).join('');

  // 解析接口状态
  const parseRows = allParses.map(p => {
    const nameMatch = (p.name || '').match(/^\[(✓|✗|❓)\]\s*(.*)$/);
    const ok = nameMatch ? nameMatch[1] === '✓' : false;
    const displayName = nameMatch ? nameMatch[2] : (p.name || p.url || '未知');
    const url = p.url || '';
    const dot = ok ? 'dot-ok' : 'dot-fail';
    const note = ok ? '<span style="color:#3fb950">可用</span>' : '<span class="error-text">不可用</span>';
    return `<tr><td><span class="dot ${dot}"></span></td><td class="site-name">🔗 ${displayName}</td><td class="api-url" title="${url}">${url || '--'}</td><td>${note}</td></tr>`;
  }).join('');

  // 站点状态（按状态排序）
  const sorted = parsedSites.sort((a, b) => {
    if (a.status === 'ok' && b.status !== 'ok') return -1;
    if (a.status !== 'ok' && b.status === 'ok') return 1;
    if (a.status === 'skip') return 1;
    if (b.status === 'skip') return -1;
    return (a.latency || 99999) - (b.latency || 99999);
  });

  const siteRows = sorted.map(s => {
    let dotClass = 'dot-skip';
    if (s.status === 'ok') dotClass = 'dot-ok';
    else if (s.status === 'fail') dotClass = 'dot-fail';

    let latencyHtml = '--';
    if (s.latency != null) {
      const cls = s.latency < 500 ? 'latency-fast' : s.latency < 2000 ? 'latency-mid' : 'latency-slow';
      latencyHtml = `<span class="${cls}">${s.latency}ms</span>`;
    }

    let noteHtml = '';
    if (s.status === 'ok') noteHtml = '<span style="color:#3fb950">可用</span>';
    else if (s.status === 'skip') noteHtml = '<span class="skip-text">跳过</span>';
    else noteHtml = '<span class="error-text">不可用</span>';

    return `<tr><td><span class="dot ${dotClass}"></span></td><td class="site-name">${s.name}</td><td>--</td><td>--</td><td>${latencyHtml}</td><td>${noteHtml}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>TVBox Alive - 存活源检测</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f1117;color:#e1e4e8;min-height:100vh;padding:20px}
.container{max-width:1100px;margin:0 auto}
h1{text-align:center;margin-bottom:8px;font-size:24px}
.subtitle{text-align:center;color:#8b949e;margin-bottom:20px;font-size:14px}
.summary{display:flex;gap:16px;justify-content:center;margin-bottom:20px;flex-wrap:wrap}
.stat{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:16px 24px;text-align:center;min-width:100px}
.stat-value{font-size:28px;font-weight:bold}
.stat-label{font-size:12px;color:#8b949e;margin-top:4px}
.stat-ok .stat-value{color:#3fb950}
.stat-fail .stat-value{color:#f85149}
.stat-skip .stat-value{color:#8b949e}
.stat-total .stat-value{color:#58a6ff}
.nav{text-align:center;margin-bottom:20px}
.nav a{color:#58a6ff;text-decoration:none;margin:0 12px;font-size:14px;background:#161b22;border:1px solid #30363d;padding:8px 16px;border-radius:8px}
.nav a:hover{background:#21262d;text-decoration:none}
table{width:100%;border-collapse:collapse;background:#161b22;border-radius:12px;overflow:hidden;border:1px solid #30363d;margin-bottom:20px}
th{background:#21262d;padding:12px 14px;text-align:left;font-size:13px;color:#8b949e;font-weight:500}
td{padding:10px 14px;border-top:1px solid #21262d;font-size:13px}
tr:hover td{background:#1c2128}
.dot{width:10px;height:10px;border-radius:50%;display:inline-block}
.dot-ok{background:#3fb950}
.dot-fail{background:#f85149}
.dot-skip{background:#484f58}
.site-name{font-weight:500;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.api-url{font-family:"SF Mono",Monaco,monospace;font-size:12px;color:#8b949e;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.latency-fast{color:#3fb950}
.latency-mid{color:#d29922}
.latency-slow{color:#f85149}
.error-text{color:#f85149;font-size:12px}
.skip-text{color:#484f58;font-size:12px}
.footer{text-align:center;color:#484f58;font-size:12px;margin-top:30px}
.info-bar{text-align:center;color:#8b949e;font-size:13px;margin-bottom:20px;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:10px}
.section-title{color:#e1e4e8;font-size:16px;margin:20px 0 10px;padding-left:4px}
</style></head>
<body><div class="container">
<h1>📡 TVBox Alive</h1>
<p class="subtitle">定时全量检测 TVBox 源站点连通性，只保留存活站点</p>
<div class="nav">
  <a href="./alive.json">📋 存活配置 JSON</a>
  <a href="./results.json">📊 测试结果 JSON</a>
</div>
<div class="info-bar">⏱ 最后测试: ${new Date(testedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} | 每6小时自动运行</div>
<div class="summary">
  <div class="stat stat-total"><div class="stat-value">${totalTested}</div><div class="stat-label">总站点</div></div>
  <div class="stat stat-ok"><div class="stat-value">${okCount}</div><div class="stat-label">存活</div></div>
  <div class="stat stat-fail"><div class="stat-value">${failCount}</div><div class="stat-label">异常</div></div>
  <div class="stat stat-skip"><div class="stat-value">${skipCount}</div><div class="stat-label">跳过</div></div>
</div>
<div class="summary">
  <div class="stat stat-ok"><div class="stat-value">${aliveSites}</div><div class="stat-label">输出站点</div></div>
  <div class="stat"><div class="stat-value" style="color:#d29922">${aliveLives}</div><div class="stat-label">直播源</div></div>
  <div class="stat"><div class="stat-value" style="color:#a371f7">${aliveParses}</div><div class="stat-label">解析接口</div></div>
</div>

<h3 class="section-title">🔍 站点测试详情</h3>
<table><thead><tr><th>状态</th><th>站点</th><th>类型</th><th>测试地址</th><th>延迟</th><th>备注</th></tr></thead><tbody>${siteRows}</tbody></table>

${liveRows ? `<h3 class="section-title">📺 直播源</h3>
<table><thead><tr><th>状态</th><th>名称</th><th>地址</th><th>备注</th></tr></thead><tbody>${liveRows}</tbody></table>` : ''}

${parseRows ? `<h3 class="section-title">🔗 解析接口</h3>
<table><thead><tr><th>状态</th><th>名称</th><th>地址</th><th>备注</th></tr></thead><tbody>${parseRows}</tbody></table>` : ''}

<div class="footer">TVBox Alive | GitHub Pages | 自动更新</div>
</div></body></html>`;
}

// 写入 index.html
const html = generateStatusPage();
fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html);

// 生成 CNAME（如果需要自定义域名，取消注释并修改）
// fs.writeFileSync(path.join(OUTPUT_DIR, 'CNAME'), 'your-domain.com');

// 生成 .nojekyll 避免 Jekyll 处理
fs.writeFileSync(path.join(OUTPUT_DIR, '.nojekyll'), '');

console.log('Pages 生成完成:');
console.log(`  output/index.html  - 状态页面`);
console.log(`  output/alive.json  - 存活配置 (TVBox 订阅地址)`);
console.log(`  output/results.json - 测试结果详情`);
