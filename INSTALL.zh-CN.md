# 安装说明

`math-timeline` 可以直接从公开 GitHub 仓库安装。插件支持 Paseo `>=0.11.0 <1.0.0`。

## 安装前准备

- 在运行 Paseo daemon 的机器上安装 Node.js 22，并确保 `npm` 在该用户的 `PATH` 中。
- Linux daemon 若要在公式中显示中文，需要安装 Droid Sans Fallback 或 Noto Sans CJK 字体。
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

安装过程会按照锁文件下载依赖并生成运行资源，因此首次安装需要访问 npm registry。安装完成后，在助手消息中输入含 `$...$` 或 `$$...$$` 的公式即可验证；也可以在工作区输入 `/math-preview` 打开预览面板。

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
