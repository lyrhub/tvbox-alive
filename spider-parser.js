/**
 * TVBox Spider JAR/DEX 解析器
 * 从 spider jar 中提取类名列表，用于判断站点是否兼容
 * 
 * TVBox spider 文件可能是：
 * 1. ZIP/JAR 格式（内含 classes.dex 或 .class 文件）
 * 2. 裸 DEX 格式（直接是 dex 二进制）
 */
const JSZip = require('jszip');

/**
 * 从 spider URL 下载并解析出所有类名
 * @param {string} spiderUrl - spider jar 的 URL（可能带 ;md5;xxx 后缀）
 * @returns {string[]} 类名列表，如 ['csp_Bilibili', 'csp_Douban', ...]
 */
async function parseSpiderClasses(spiderUrl) {
  const url = spiderUrl.split(';')[0]; // 去掉 ;md5;xxx 后缀
  
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TVBox-Alive/1.0' },
      signal: controller.signal
    });
    clearTimeout(timer);
    
    if (!res.ok) {
      console.log(`  Spider 下载失败: HTTP ${res.status}`);
      return [];
    }
    
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    if (bytes.length < 8) return [];
    
    // 判断格式
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    
    if (magic === 'PK\x03\x04' || magic === 'PK\x05\x06') {
      // ZIP/JAR 格式
      return await parseJarFile(buffer);
    }
    
    if (magic.startsWith('dex\n')) {
      // 裸 DEX 格式
      return parseDexClasses(bytes);
    }
    
    console.log(`  Spider 格式未知: magic=${magic.replace(/[^\x20-\x7e]/g, '?')}`);
    return [];
  } catch (e) {
    console.log(`  Spider 解析失败: ${e.message}`);
    return [];
  }
}

/**
 * 解析 JAR/ZIP 文件
 */
async function parseJarFile(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const classes = new Set();
  
  // 优先查找 classes.dex
  for (const [name, entry] of Object.entries(zip.files)) {
    if (name.endsWith('.dex') && !entry.dir) {
      const dexData = await entry.async('uint8array');
      const dexClasses = parseDexClasses(dexData);
      dexClasses.forEach(c => classes.add(c));
    }
  }
  
  if (classes.size > 0) return [...classes];
  
  // 没有 dex，查找 .class 文件
  for (const [name, entry] of Object.entries(zip.files)) {
    if (name.endsWith('.class') && !entry.dir) {
      // 提取类名：com/github/catvod/spider/Bilibili.class → Bilibili
      const className = name.replace(/\.class$/, '').split('/').pop();
      // 跳过内部类（含 $）和常见非爬虫类
      if (!className.includes('$') && !isSystemClass(className)) {
        classes.add(className);
      }
    }
  }
  
  return [...classes];
}

/**
 * 解析 DEX 文件，提取类名
 * 
 * DEX Header 结构（偏移量）：
 * 0x00: magic (8 bytes) "dex\n039\0"
 * 0x08: checksum (4 bytes)
 * 0x0C: signature (20 bytes)
 * 0x20: file_size (4 bytes)
 * 0x24: header_size (4 bytes)
 * 0x28: endian_tag (4 bytes)
 * 0x2C: link_size (4 bytes)
 * 0x30: link_off (4 bytes)
 * 0x34: map_off (4 bytes)
 * 0x38: string_ids_size (4 bytes)
 * 0x3C: string_ids_off (4 bytes)
 * 0x40: type_ids_size (4 bytes)
 * 0x44: type_ids_off (4 bytes)
 * 0x48: proto_ids_size (4 bytes)
 * 0x4C: proto_ids_off (4 bytes)
 * 0x50: field_ids_size (4 bytes)
 * 0x54: field_ids_off (4 bytes)
 * 0x58: method_ids_size (4 bytes)
 * 0x5C: method_ids_off (4 bytes)
 * 0x60: class_defs_size (4 bytes)
 * 0x64: class_defs_off (4 bytes)
 */
function parseDexClasses(dex) {
  if (dex.length < 0x70) return [];
  
  const view = new DataView(dex.buffer, dex.byteOffset, dex.byteLength);
  
  // 验证 magic
  const magic = String.fromCharCode(dex[0], dex[1], dex[2], dex[3]);
  if (!magic.startsWith('dex\n')) return [];
  
  // 读取 header
  const stringIdsSize = view.getUint32(0x38, true); // little-endian
  const stringIdsOff = view.getUint32(0x3C, true);
  const typeIdsSize = view.getUint32(0x40, true);
  const typeIdsOff = view.getUint32(0x44, true);
  const classDefsSize = view.getUint32(0x60, true);
  const classDefsOff = view.getUint32(0x64, true);
  
  // 读取 string table
  const strings = readStringTable(dex, view, stringIdsSize, stringIdsOff);
  
  // 读取 type_ids（每个 type_id 是一个 uint32 指向 string_ids 的索引）
  const typeNames = [];
  for (let i = 0; i < typeIdsSize; i++) {
    const stringIdx = view.getUint32(typeIdsOff + i * 4, true);
    if (stringIdx < strings.length) {
      typeNames.push(strings[stringIdx]);
    }
  }
  
  // 读取 class_defs，提取类名
  // class_def_item: class_idx(4) + access_flags(4) + superclass_idx(4) + ... = 32 bytes each
  const classes = [];
  for (let i = 0; i < classDefsSize; i++) {
    const classIdx = view.getUint32(classDefsOff + i * 32, true);
    if (classIdx < typeNames.length) {
      const typeDesc = typeNames[classIdx];
      // 类型描述符格式: Lcom/github/catvod/spider/Bilibili; → Bilibili
      const className = convertTypeDescriptor(typeDesc);
      if (className && !isSystemClass(className)) {
        classes.push(className);
      }
    }
  }
  
  return classes;
}

/**
 * 读取 DEX string table
 */
function readStringTable(dex, view, size, offset) {
  const strings = [];
  
  for (let i = 0; i < size; i++) {
    // string_id_item: uint32 string_data_off
    const stringDataOff = view.getUint32(offset + i * 4, true);
    
    if (stringDataOff >= dex.length) {
      strings.push('');
      continue;
    }
    
    // string_data_item: uleb128 utf16_size, then MUTF-8 data terminated by 0x00
    let pos = stringDataOff;
    
    // 跳过 uleb128 utf16_size
    while (pos < dex.length && (dex[pos] & 0x80) !== 0) pos++;
    pos++; // 跳过最后一个 uleb128 字节
    
    // 读取 MUTF-8 字符串直到 0x00
    let str = '';
    while (pos < dex.length && dex[pos] !== 0) {
      const byte = dex[pos];
      if ((byte & 0x80) === 0) {
        // 单字节
        str += String.fromCharCode(byte);
        pos++;
      } else if ((byte & 0xE0) === 0xC0) {
        // 双字节
        const b2 = dex[pos + 1] || 0;
        str += String.fromCharCode(((byte & 0x1F) << 6) | (b2 & 0x3F));
        pos += 2;
      } else if ((byte & 0xF0) === 0xE0) {
        // 三字节
        const b2 = dex[pos + 1] || 0;
        const b3 = dex[pos + 2] || 0;
        str += String.fromCharCode(((byte & 0x0F) << 12) | ((b2 & 0x3F) << 6) | (b3 & 0x3F));
        pos += 3;
      } else {
        pos++;
      }
    }
    
    strings.push(str);
  }
  
  return strings;
}

/**
 * 将 DEX 类型描述符转为简短类名
 * Lcom/github/catvod/spider/Bilibili; → Bilibili
 * Lcom/github/catvod/spider/csp_Douban; → csp_Douban
 */
function convertTypeDescriptor(desc) {
  if (!desc || !desc.startsWith('L') || !desc.endsWith(';')) return '';
  // 去掉 L 和 ;
  const fullPath = desc.substring(1, desc.length - 1);
  // 取最后一段
  const parts = fullPath.split('/');
  const className = parts[parts.length - 1];
  // 跳过内部类
  if (className.includes('$')) return '';
  return className;
}

/**
 * 判断是否是系统/框架类（不是爬虫类）
 * TVBox 爬虫类通常以 csp_ 开头，或者是大写驼峰命名
 */
function isSystemClass(name) {
  // TVBox 爬虫类的常见模式 - 这些一定要保留
  if (name.startsWith('csp_') || name.startsWith('Csp_')) return false;
  if (name.startsWith('Spider')) return false;
  
  const systemExact = new Set([
    'R', 'BuildConfig', 'Manifest',
    'Application', 'Activity', 'Service',
    'Provider', 'Receiver', 'Fragment',
  ]);
  if (systemExact.has(name)) return true;
  
  const systemPatterns = [
    /^I[A-Z][a-z]/, // 接口如 IParser
    /Impl$/, // 实现类
    /Exception$/, /Error$/,
    /^android/, /^java/, /^kotlin/, /^androidx/,
    /^com\.google/, /^org\.apache/,
  ];
  
  return systemPatterns.some(p => p.test(name));
}

/**
 * 判断站点的 api 字段是否在 spider 的类名列表中
 * @param {string} siteApi - 站点的 api 字段，如 "csp_Bilibili"
 * @param {string[]} spiderClasses - spider 中的类名列表
 * @returns {boolean}
 */
function isSiteCompatible(siteApi, spiderClasses) {
  if (!siteApi || !spiderClasses || spiderClasses.length === 0) return true; // 无法判断时默认兼容
  
  // api 字段可能是完整类名或简短名
  // 如 "csp_Bilibili", "CatVodSpider", "com.github.catvod.spider.Bilibili"
  const apiName = siteApi.split('.').pop(); // 取最后一段
  
  // 精确匹配
  if (spiderClasses.includes(apiName)) return true;
  if (spiderClasses.includes(siteApi)) return true;
  
  // 模糊匹配（忽略大小写）
  const lower = apiName.toLowerCase();
  return spiderClasses.some(c => c.toLowerCase() === lower);
}

module.exports = { parseSpiderClasses, isSiteCompatible, parseDexClasses, parseJarFile };
