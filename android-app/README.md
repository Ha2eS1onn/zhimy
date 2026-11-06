# 知脉 Android 壳

Capacitor 7 壳：WebView 直接加载 <https://zhimy.kasho.fun>，APK 只是入口。内容更新不用重新发版（改 `server.url` 才会）。

## 构建

本机工具链装在 `D:\Android`：

| 组件 | 位置 / 版本 | 说明 |
|---|---|---|
| JDK 21 | `D:\Android\jdk-21` | **Capacitor 7.6 用 Java 21**，JDK 17 会报“无效的源发行版：21” |
| Android SDK | `D:\Android\sdk` | platform-tools、`platforms;android-35`、`build-tools;35.0.0` |
| Gradle 8.11.1 | `D:\Android\gradle-home`（`GRADLE_USER_HOME`） | wrapper 自动下载 |

```powershell
$env:JAVA_HOME        = "D:\Android\jdk-21"
$env:ANDROID_HOME     = "D:\Android\sdk"
$env:ANDROID_SDK_ROOT = "D:\Android\sdk"
$env:GRADLE_USER_HOME = "D:\Android\gradle-home"
# 国内网络：Gradle 下载依赖需要代理
$env:JAVA_TOOL_OPTIONS = "-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7897 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7897 -Dhttp.nonProxyHosts=localhost|127.0.0.1"

npm install            # 首次
npm run build:release  # → android/app/build/outputs/apk/release/app-release.apk
```

产物复制到 `dist/zhimy-<version>.apk`（`dist/` 不进仓库）。校验：

```powershell
& "D:\Android\sdk\build-tools\35.0.0\apksigner.bat" verify --print-certs dist\zhimy-0.1.0.apk
& "D:\Android\sdk\build-tools\35.0.0\aapt2.exe" dump badging dist\zhimy-0.1.0.apk
```

## 签名

- `android/keystore.properties`（本机，已 gitignore）指向 `android/app/keystore/zhimy-release.jks`，包含随机密码。
- **keystore 丢了就无法覆盖安装旧版本**（只能卸载重装）。备份 `android/app/keystore/` 与 `android/keystore.properties`。
- 这是个人自用签名，不具备商店发布所需的身份意义。

## 定制位置

| 改什么 | 文件 |
|---|---|
| 加载地址 | `capacitor.config.ts` 的 `server.url`（也可用 `ANDROID_APP_URL` 覆盖） |
| 包名 / 版本 | `android/app/build.gradle`（`fun.kasho.zhimy`、versionCode/versionName） |
| 应用名 | `android/app/src/main/res/values/strings.xml` |
| 图标 | `python scripts/build-android-icons.py`（主仓库，复用 PWA 图标绘制） |
| 主题 / 启动屏 / 深浅色 | `android/app/src/main/res/values{,-night}/` |
| 返回键 | `android/app/src/main/java/fun/kasho/zhimy/MainActivity.java` |

## 已知限制

- 只加载线上站点：断网时显示 Web 的离线提示页，不能离线读写图谱。
- 自签 APK，不上架应用商店；安装时 Android 会提示“未知来源”。
- 微信 / QQ 内直接点开 APK 通常不能安装，需要先保存到本机再用文件管理器安装。
- WebView 里 blob 下载不生效：Web 端检测到 UA 里的 `ZhimyApp/` 时，导出 JSON 改为复制到剪贴板。
- 本机没有 Android 设备，**尚未做真机验证**（键盘、文件选择、Service Worker、返回键需上机确认）。
