# TVBox Alive

基于 GitHub Actions + GitHub Pages 的 TVBox 存活源检测服务。

定时全量测试多个 TVBox 源中的站点连通性，生成只包含存活站点的配置文件，部署到 GitHub Pages 供 TVBox 客户端订阅。

## 订阅地址

```
https://lyrhub.github.io/tvbox-alive/alive.json
```

## 页面

| 地址 | 说明 |
|------|------|
| `/` | 状态监控页面（站点测试详情） |
| `/alive.json` | 存活配置 JSON（TVBox 订阅地址） |
| `/results.json` | 完整测试结果 |

## 工作原理

1. GitHub Actions 每 15 分钟触发一次
2. `test.js` 拉取所有源，全量测试站点/Spider/直播/解析的连通性
3. 生成 `alive.json`（只含存活站点）和 `results.json`（测试详情）
4. `generate-pages.js` 生成状态监控 HTML 页面
5. 部署到 GitHub Pages

## 过滤规则

- 排除网盘/弹幕/磁力类站点
- 排除 Spider 不可用的 type:3 站点
- 排除连接测试失败的站点
- 对 drpy 类站点，下载规则 js 提取 host 进行测试

## 本地运行

```bash
# 运行测试
npm run test

# 生成页面
npm run pages

# 完整构建（测试 + 生成页面）
npm run build
```

## 部署配置

1. 在仓库 Settings → Pages 中选择 Source 为 "GitHub Actions"
2. 推送代码到 main 分支即可自动部署
3. 也可以在 Actions 页面手动触发 workflow

## 自定义源

编辑 `test.js` 顶部的 `SOURCES` 数组和 `SPIDER` 变量。
