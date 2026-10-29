# 安装说明

`math-timeline` 可以直接从公开 GitHub 仓库安装。插件支持 Paseo `>=0.11.0 <1.0.0`。

## 安装前准备

- 在运行 Paseo daemon 的机器上安装 Node.js 22，并确保 `npm` 在该用户的 `PATH` 中。
- Linux daemon 若要在公式或 Mermaid 节点中显示中文，需要安装 Droid Sans Fallback 或 Noto Sans CJK 字体。
- 在 Paseo 的 **Settings → Plugins** 中启用插件功能。

Paseo 插件是受信任且不受沙箱限制的代码。服务端插件可以访问 daemon 机器上的文件、进程、凭据和网络，客户端代码会在 Paseo 应用中运行。安装前请检查源码和依赖。

## 安装

1. 在 daemon 所在机器上执行：

   ```bash
   paseo plugin add git:jiuhao47/paseo-math-timeline
   ```

2. 检查状态：

   ```bash
   paseo plugin ls math-timeline
   ```

   状态应为 `running`，且不应显示加载错误。

安装过程会按照锁文件下载依赖、下载与 Playwright 版本匹配的 Chromium，并生成运行资源。因此首次安装需要访问 npm registry 和 Playwright 浏览器下载地址，耗时与磁盘占用都比仅公式版本更大；Chromium 二进制不会写入 Git 仓库。

手动克隆开发时，浏览器安装命令为：

```bash
npm ci --ignore-scripts
npm run browser:install
npm run build
```

Mermaid 源码只在本地 Paseo 连接和所选 daemon 上处理，不会发送到 CDN、Kroki 或其他渲染服务。Chromium 页面禁止网络、下载、Service Worker、外部图片和活动链接，最终只向客户端返回 PNG。启动时会先尝试 Chromium 正常沙箱；只有 Chromium 明确报告 `No usable sandbox` 时才用 `--no-sandbox` 兼容重试，其余离线和内容安全限制仍保留。

安装完成后，可在同一条助手消息中放入一个 `mermaid` 围栏和 `$...$` / `$$...$$` 公式验证混合渲染；也可以输入 `/math-preview` 打开公式预览。图表语法错误、超限、浏览器不可用、字体缺失或图片加载失败时，会回退为可选择的 Mermaid 源码。图表是分档提高密度的光栅 PNG，超大图在高倍缩放时可能变软。

## 更新或卸载

从 GitHub 获取并应用更新：

```bash
paseo plugin update math-timeline
```

卸载命令：

```bash
paseo plugin remove math-timeline
```

卸载会删除 Paseo 管理的 Git 工作目录；公开仓库和本地手动克隆的目录不受影响。
