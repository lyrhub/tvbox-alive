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
  const sites = resultsData?.sites || {};
  const spiders = resultsData?.spiders || {};
  const testedAt = resultsData?.tested_at || new Date().toISOString();

  const entries = Object.entries(sites);
  const okCount = entries.filter(([, r]) => r.status === 'ok').length;
  const failCount = entries.filter(([, r]) => r.status === 'fail').length;
  const skipCount = entries.filter(([, r]) => r.status === 'skip').length;
  const totalTested = entries.length;

  const aliveSites = aliveData?.sites?.length || 0;
  const aliveLives = aliveData?.lives?.length || 0;
  const aliveParses = aliveData?.parses?.length || 0;

  // Spider 状态
  const spiderRows = Object.entries(spiders).map(([url, alive]) => {
    const name = url.split('/').pop().split(';')[0];
    const dot = alive ? 'dot-ok' : 'dot-fail';
    const status = alive ? '<span style="color:#3fb950">可用</span>' : '<span style="color:#f85149">不可用</span>';
    return `<tr><td><span class="dot ${dot}"></span></td><td class="site-name">🕷 ${name}</td><td>Jar</td><td class="api-url" title="${url.split(';')[0]}">${url.split(';')[0]}</td><td>--</td><td>${status}</td></tr>`;
  }).join('');

  // 站点状态（按状态排序）
  const sorted = entries.sort((a, b) => {
    if (a[1].status === 'ok' && b[1].status !== 'ok') return -1;
    if (a[1].status !== 'ok' && b[1].status === 'ok') return 1;
    if (a[1].status === 'skip') return 1;
    if (b[1].status === 'skip') return -1;
    return (a[1].latency || 99999) - (b[1].latency || 99999);
  });

  const siteRows = sorted.map(([key, r]) => {
    let dotClass = 'dot-skip';
    if (r.status === 'ok') dotClass = 'dot-ok';
    else if (r.status === 'fail') dotClass = 'dot-fail';

    let latencyHtml = '--';
    if (r.latency != null) {
      const cls = r.latency < 500 ? 'latency-fast' : r.latency < 2000 ? 'latency-mid' : 'latency-slow';
      latencyHtml = `<span class="${cls}">${r.latency}ms</span>`;
    }

    let noteHtml = '';
    if (r.status === 'ok') noteHtml = `<span style="color:#3fb950">HTTP ${r.http || 200}</span>`;
    else if (r.status === 'skip') noteHtml = '<span class="skip-text">无可测试URL</span>';
    else noteHtml = `<span class="error-text">${r.error || 'HTTP ' + r.http}</span>`;

    const testUrl = r.url || '';

    return `<tr><td><span class="dot ${dotClass}"></span></td><td class="site-name">${key}</td><td>--</td><td class="api-url" title="${testUrl}">${testUrl || '--'}</td><td>${latencyHtml}</td><td>${noteHtml}</td></tr>`;
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
<div class="info-bar">⏱ 最后测试: ${new Date(testedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} | 每15分钟自动运行</div>
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

${spiderRows ? `<h3 class="section-title">🕷 Spider 状态</h3>
<table><thead><tr><th>状态</th><th>名称</th><th>类型</th><th>地址</th><th>延迟</th><th>备注</th></tr></thead><tbody>${spiderRows}</tbody></table>` : ''}

<h3 class="section-title">🔍 站点测试详情</h3>
<table><thead><tr><th>状态</th><th>站点</th><th>类型</th><th>测试地址</th><th>延迟</th><th>备注</th></tr></thead><tbody>${siteRows}</tbody></table>

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
