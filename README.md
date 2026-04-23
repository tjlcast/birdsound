# 闻啼鸟 BirdSound

闻啼鸟是一款面向鸟声识别场景的 React + TypeScript 前端应用。用户可以直接录制周围环境中的鸟鸣，也可以上传已有音频文件；应用会携带当前位置将音频提交到后端服务进行分析，并在本地展示识别结果、置信度、鸟类资料和历史记录。

当前仓库以前端为主，同时包含 Capacitor Android 工程，便于将 Web 应用打包为 Android App。

## 目录

- [闻啼鸟 BirdSound](#闻啼鸟-birdsound)
  - [目录](#目录)
  - [核心功能](#核心功能)
  - [技术栈](#技术栈)
  - [项目结构](#项目结构)
  - [环境要求](#环境要求)
  - [快速开始](#快速开始)
  - [配置说明](#配置说明)
    - [前端环境变量](#前端环境变量)
    - [后端服务地址](#后端服务地址)
  - [后端接口约定](#后端接口约定)
    - [健康检查](#健康检查)
    - [鸟声分析](#鸟声分析)
  - [常用命令](#常用命令)
  - [Android 打包与 APK](#android-打包与-apk)
    - [生成 Debug APK](#生成-debug-apk)
    - [生成 Release APK](#生成-release-apk)
    - [生成签名 Release APK](#生成签名-release-apk)
    - [运行到模拟器或真机](#运行到模拟器或真机)
  - [数据与本地存储](#数据与本地存储)
  - [开发说明](#开发说明)
    - [代码风格](#代码风格)
    - [主要文件](#主要文件)
    - [手动验证清单](#手动验证清单)
  - [排障指南](#排障指南)
    - [页面显示“服务异常”](#页面显示服务异常)
    - [录音不可用](#录音不可用)
    - [定位不可用](#定位不可用)
    - [上传后分析失败](#上传后分析失败)
    - [Android 真机无法连接后端](#android-真机无法连接后端)
  - [提交与 PR 规范](#提交与-pr-规范)
  - [安全提示](#安全提示)
  - [License](#license)

## 核心功能

- 麦克风录音：通过浏览器 `MediaRecorder` 采集环境音频。
- 音频上传：支持 `MP3`、`WAV`、`M4A`、`AAC`、`OGG`、`FLAC` 等常见音频格式。
- 地理位置辅助：读取浏览器定位，将经纬度随音频一起提交给分析服务。
- 服务健康检查：定时请求后端 `/health`，在界面中显示服务可用状态。
- 服务地址配置：可在界面中修改后端 IP 和端口，并保存到本地。
- 端侧模型实验：Android App 的“设置 > 实验”页支持从手机文件导入本地模型，并预留语音转文字与大模型对话调用链路。
- 鸟类识别结果展示：展示中文名、学名、图片、置信度和识别详情。
- 本地历史记录：最近识别结果会保存到 `localStorage`，支持查看和清空。
- 移动端适配：包含响应式 UI 和 Capacitor Android 项目。

## 技术栈

- [Vite](https://vite.dev/)：前端构建与开发服务器。
- [React 19](https://react.dev/)：用户界面。
- [TypeScript](https://www.typescriptlang.org/)：静态类型。
- [Tailwind CSS 4](https://tailwindcss.com/)：样式系统。
- [Motion](https://motion.dev/)：动效。
- [Lucide React](https://lucide.dev/)：图标。
- [Axios](https://axios-http.com/)：HTTP 请求。
- [Capacitor](https://capacitorjs.com/)：Android 原生壳。
- Android Java + C++ JNI：端侧模型实验的插件、私有目录管理和 native runtime 桥接。

## 项目结构

```text
.
├── android/                 # Capacitor Android 原生工程
├── openspec/                # 需求/变更规格文档
├── src/
│   ├── constants/
│   │   └── birds.ts         # 鸟类 fallback/mock 元数据
│   ├── services/
│   │   ├── api.ts           # 后端健康检查与鸟声分析请求
│   │   └── history.ts       # localStorage 历史记录读写
│   ├── App.tsx              # 主 UI、录音、上传、分析、设置、历史逻辑
│   ├── index.css            # 全局样式与 Tailwind 主题
│   ├── main.tsx             # React 入口
│   └── types.ts             # 共享类型定义
├── .env.example             # 环境变量示例
├── capacitor.config.ts      # Capacitor 配置
├── metadata.json            # AI Studio 应用元信息
├── package.json             # npm 脚本与依赖
├── tsconfig.json            # TypeScript 配置
└── vite.config.ts           # Vite 配置
```

端侧模型相关文件：

```text
android/app/src/main/java/com/example/bird_sound/localmodels/
├── LocalModelPlugin.java        # Capacitor 插件：文件选择、私有目录、线程调度
├── LocalModelNativeBridge.java  # Java/JNI 桥
└── LocalModelDefinition.java    # 模型元数据

android/app/src/main/cpp/
├── CMakeLists.txt
├── local_model_jni.cpp          # JNI 字符串、异常与方法桥接
├── local_model_runtime.h        # native runtime 接口
└── local_model_runtime.cpp      # llama.cpp / whisper.cpp 后端接入点
```

## 环境要求

推荐环境：

- Node.js 20 LTS 或更高版本。
- npm 10 或更高版本。
- 一个兼容当前接口约定的后端分析服务。
- 使用录音和定位功能时，需要浏览器授予麦克风和定位权限。

Android 开发还需要：

- Android Studio。
- JDK 21，当前 Capacitor Android 配置使用 Java 21。
- Android SDK、Gradle 和可用模拟器或真机。

## 快速开始

1. 安装依赖：

   ```bash
   npm install
   ```

2. 准备环境变量：

   ```bash
   cp .env.example .env.local
   ```

   按需修改 `.env.local`。当前前端主要通过界面配置后端地址；`GEMINI_API_KEY` 由 Vite 配置注入，保留给 AI Studio 或后续 Gemini 相关能力使用。

3. 启动后端服务。

   默认前端会请求：

   ```text
   http://127.0.0.1:8000
   ```

   请确保后端至少实现 `/health` 和 `/analyze` 两个接口，详见 [后端接口约定](#后端接口约定)。

4. 启动前端开发服务器：

   ```bash
   npm run dev
   ```

5. 在浏览器打开：

   ```text
   http://localhost:3000
   ```

## 配置说明

### 前端环境变量

`.env.example` 中包含：

```env
GEMINI_API_KEY="MY_GEMINI_API_KEY"
APP_URL="MY_APP_URL"
```

说明：

- `GEMINI_API_KEY`：Vite 当前会通过 `vite.config.ts` 注入为 `process.env.GEMINI_API_KEY`。本仓库当前前端识别流程实际调用的是独立后端服务，不直接在浏览器内调用 Gemini。
- `APP_URL`：AI Studio/部署环境可能使用的应用 URL。

请不要提交真实密钥。私有配置应放在 `.env.local` 或部署平台的 Secret 配置中。

### 后端服务地址

默认后端地址在 `src/services/api.ts` 中定义：

```ts
export const DEFAULT_API_HOST = '127.0.0.1';
export const DEFAULT_API_PORT = '8000';
```

用户也可以在应用右上角设置面板中修改服务 IP 和端口。修改后的值会保存到浏览器 `localStorage`：

- `birdsound_api_host`
- `birdsound_api_port`

如果在真机或局域网设备上调试，请把服务地址改成电脑的局域网 IP，例如：

```text
http://192.168.1.20:8000
```

应用配置界面只需要填写主机和端口，不需要额外输入路径。

### 端侧模型实验

端侧模型入口位于 Android App 的“设置 > 实验”。该页面不修改原有 `/analyze` 鸟声识别功能；原识别流程仍然通过 `src/services/api.ts` 请求后端服务。

实验页当前管理三类本地模型文件：

| 用途 | 文件名 | 后端 |
| --- | --- | --- |
| 语音转文字 | `ggml-small.bin` | whisper.cpp |
| 文本对话 | `qwen2-0_5b-instruct-q8_0.gguf` | llama.cpp |
| 视觉语言实验 | `Qwen3VL-2B-Instruct-Q4_K_M.gguf` | llama.cpp / multimodal |

模型导入流程：

1. 点击实验页中的模型条目。
2. Android 文件选择器从手机文件中选择对应模型。
3. 插件复制模型到 App 私有目录：

   ```text
   /data/data/com.example.bird_sound/files/local-models/
   ```

4. JS 侧只读取模型状态，不直接管理真实路径；路径由 Android 层返回并维护。

Native 推理接入点：

- `android/app/src/main/cpp/local_model_runtime.cpp`
  - `transcribeAudio(...)`：接入 whisper.cpp，读取 `ggml-small.bin` 和音频路径，返回转写文本。
  - `runChat(...)`：接入 llama.cpp，读取 GGUF 模型路径和 prompt，返回模型回复。
  - `resetSession(...)`：清理对应模型会话缓存。

当前已从 `android/llama.zip` 接入 llama.cpp 文本 GGUF 后端，可用于 Qwen 文本对话；`Qwen3VL` 目前只走文本 prompt，图像输入仍需继续接入 multimodal projector 与图片预处理。whisper.cpp 后端尚未接入，语音转文字会继续返回未就绪状态。后续接入 whisper.cpp 时，应让 `getRuntimeStatus()` 按实际链接情况返回 `whisperReady`。

## 后端接口约定

前端通过 `src/services/api.ts` 调用后端。

### 健康检查

```http
GET /health
```

期望响应：

```json
{
  "status": "ok"
}
```

当前前端只在 `status === "ok"` 时认为服务正常。

### 鸟声分析

```http
POST /analyze
Content-Type: multipart/form-data
```

表单字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `audio` | File | 录制或上传的音频文件 |
| `lat` | string | 纬度 |
| `lon` | string | 经度 |

期望响应：

```json
{
  "message": "识别完成",
  "detections": [
    {
      "scientific_name": "Pycnonotus sinensis",
      "common_name": "Light-vented Bulbul",
      "species": "pycsin1",
      "confidence": 0.92,
      "start_seconds": 0.8,
      "end_seconds": 3.4,
      "common_name_zh": "白头鹎",
      "description": "常见庭园鸣禽，鸣声清脆婉转。",
      "image_url": "https://example.com/bird.jpg"
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `message` | string | 否 | 后端提示信息。无识别结果时会作为前端提示。 |
| `detections` | array | 是 | 识别结果列表。 |
| `scientific_name` | string | 是 | 学名。 |
| `common_name` | string | 是 | 英文通用名。 |
| `species` | string \| null | 是 | 物种 ID。可匹配 `src/constants/birds.ts` 中的 fallback 数据。 |
| `confidence` | number | 是 | 置信度，建议范围 `0` 到 `1`。 |
| `start_seconds` | number | 是 | 该识别片段开始时间，单位秒。 |
| `end_seconds` | number | 是 | 该识别片段结束时间，单位秒。 |
| `common_name_zh` | string | 否 | 中文名。 |
| `description` | string | 否 | 鸟类描述。 |
| `image_url` | string | 否 | 鸟类图片 URL。 |

错误响应建议返回以下任一字段，前端会优先提取并展示：

```json
{
  "message": "音频格式不支持"
}
```

也支持：

```json
{
  "detail": "服务暂不可用"
}
```

或：

```json
{
  "error": "分析失败"
}
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm install` | 安装依赖。 |
| `npm run dev` | 启动 Vite 开发服务器，监听 `0.0.0.0:3000`。 |
| `npm run build` | 生成生产构建到 `dist/`。 |
| `npm run preview` | 本地预览生产构建。 |
| `npm run lint` | 运行 TypeScript 类型检查。 |
| `npm run clean` | 删除 `dist/`。 |

提交或合并前建议至少执行：

```bash
npm run lint
npm run build
```

## Android 打包与 APK

本仓库已经包含 `android/` 原生工程和 `capacitor.config.ts`：

```ts
const config: CapacitorConfig = {
  appId: 'com.example.bird_sound',
  appName: 'bird_sound',
  webDir: 'dist'
};
```

### 生成 Debug APK

适合本地测试、发给自己安装验证。

1. 构建 Web 资源：

   ```bash
   npm run build
   ```

2. 同步到 Android 工程：

   ```bash
   npx cap sync android
   ```

3. 使用 Gradle 打包 Debug APK：

   ```bash
   cd android
   ./gradlew assembleDebug

   # or 在Android Studio 中运行
   # Build > Generate Signed Bundle / APK > Generate APKs
   ```

4. 打包完成后，APK 文件位于：

   ```text
   android/app/build/outputs/apk/debug/app-debug.apk
   ```

5. 如果手机已开启 USB 调试并连接电脑，可以直接安装：

   ```bash
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

### 生成 Release APK

Release 包适合进一步测试或准备发布。未配置签名时，Gradle 可能只生成未签名或无法直接发布的产物。

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
```

常见输出路径：

```text
android/app/build/outputs/apk/release/app-release.apk
```

如果要提交到应用商店或正式分发，需要生成签名 Release 包，详见下一节。

### 生成签名 Release APK

正式发布 Android App 时必须签名。推荐使用 Android Studio 完成签名配置：

1. 打开 Android 工程：

   ```bash
   npx cap open android
   ```

2. 在 Android Studio 中选择 `Build > Generate Signed App Bundle / APK...`。
3. 选择 `APK`。
4. 新建或选择已有 keystore。
5. 选择 `release` 构建类型。
6. 完成向导后，Android Studio 会生成签名 APK。

如果偏好命令行，可以先创建 keystore：

```bash
keytool -genkeypair -v \
  -keystore release-key.jks \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias birdsound
```

然后在 Android Gradle 配置中添加 signingConfig。注意不要把 keystore、密码或真实签名配置提交到仓库。

### 运行到模拟器或真机

如果只是调试，不一定要手动找 APK。可以直接运行：

```bash
npm run build
npx cap sync android
npx cap run android
```

也可以打开 Android Studio 后点击 Run：

```bash
npx cap open android
```

注意事项：

- Android Manifest 已声明 `RECORD_AUDIO`、`MODIFY_AUDIO_SETTINGS` 和 `INTERNET` 权限。
- 当前应用运行时依赖后端服务。真机访问电脑本机后端时，通常不能使用 `127.0.0.1`，需要改成电脑局域网 IP。
- `AndroidManifest.xml` 中当前启用了 `android:usesCleartextTraffic="true"`，因此开发阶段可以访问 HTTP 服务。生产环境建议使用 HTTPS 并收紧网络安全配置。

## 数据与本地存储

应用会使用浏览器 `localStorage` 保存少量本地数据：

| Key | 说明 |
| --- | --- |
| `birdsound-history` | 最近识别历史，最多保留 20 条。 |
| `birdsound_api_host` | 用户配置的后端主机。 |
| `birdsound_api_port` | 用户配置的后端端口。 |

历史记录包含：

- 创建时间。
- 分析位置。
- 分析耗时。
- 后端返回的识别结果列表。

录音或上传的音频文件只在当前页面会话中以 Object URL 用于预览，不会持久化保存到本地历史。

## 开发说明

### 代码风格

- 使用 TypeScript + React 函数组件。
- 使用 2 空格缩进和分号。
- React 组件和导出类型使用 `PascalCase`。
- 函数、变量和 Hook 使用 `camelCase`。
- 静态数据放在 `src/constants/`。
- 网络和持久化逻辑放在 `src/services/`。
- 优先使用显式相对导入，例如 `./services/api`。

### 主要文件

- `src/App.tsx`：主交互流程，包括录音、上传、分析、状态切换、设置、结果和历史记录。
- `src/services/api.ts`：构造 API 地址、健康检查、提交音频分析请求、错误信息归一化。
- `src/services/history.ts`：历史记录校验、读取、保存和清空。
- `src/constants/birds.ts`：当后端缺少中文名、描述或图片时使用的 fallback/mock 鸟类资料。
- `src/types.ts`：后端响应、识别结果、历史记录等共享类型。
- `src/index.css`：Tailwind 主题、玻璃拟态面板和移动端安全区样式。

### 手动验证清单

当前仓库尚未配置自动化测试。修改功能后建议手动检查：

- 首屏能正常加载。
- 麦克风录音开始、取消、停止流程正常。
- 上传音频文件后会进入分析流程。
- 非音频文件会被拦截并显示错误。
- 定位权限允许或拒绝时都有合理反馈。
- 后端在线和离线时健康状态显示正确。
- 服务配置保存后，请求会使用新的地址。
- 分析成功后结果列表、置信度、图片和详情正常。
- 无识别结果时提示文案正常。
- 历史记录可打开、可清空，最多保留 20 条。
- 桌面端和移动端布局无明显遮挡或溢出。

## 排障指南

### 页面显示“服务异常”

请确认：

- 后端服务已经启动。
- 后端监听地址和端口与前端设置一致。
- `GET /health` 返回 `{ "status": "ok" }`。
- 浏览器控制台没有 CORS 报错。
- 真机调试时没有继续使用 `127.0.0.1` 访问电脑后端。

### 录音不可用

请确认：

- 页面运行在 `localhost`、HTTPS 或可信 WebView 环境中。
- 浏览器或系统已授予麦克风权限。
- 当前设备存在可用麦克风。

### 定位不可用

请确认：

- 浏览器或系统已授予定位权限。
- 页面运行环境支持 `navigator.geolocation`。
- 移动设备开启了系统定位服务。

### 上传后分析失败

请确认：

- 文件确实是音频格式。
- 后端支持该音频编码。
- 后端 `/analyze` 使用 `multipart/form-data` 接收 `audio`、`lat`、`lon`。
- 后端响应结构符合 [后端接口约定](#后端接口约定)。

### Android 真机无法连接后端

常见原因是后端地址配置错误：

- `127.0.0.1` 在真机中指向手机本机，不是开发电脑。
- 请将应用中的服务 IP 改为开发电脑的局域网 IP。
- 确认手机和电脑在同一网络。
- 确认防火墙允许访问后端端口。

## 提交与 PR 规范

推荐继续使用短小的 Conventional Commit 风格：

```text
feat: add compact mode to result list
fix: handle empty analyze response
docs: expand project readme
```

PR 建议包含：

- 用户可见变化摘要。
- 是否涉及环境变量、后端接口或部署配置变化。
- UI 变化的截图或短录屏。
- `npm run lint` 和 `npm run build` 的执行结果。
- 仍需人工验证或已知限制。

## 安全提示

- 不要提交真实 API Key、访问令牌或私有服务地址。
- 浏览器端代码中的环境变量可能被打包暴露，不应存放真正的服务端密钥。
- 生产环境建议使用 HTTPS 后端，并限制 CORS 来源。
- 如果后端会处理用户上传音频，请在服务端限制文件大小、文件类型和请求频率。

## License

当前仓库尚未声明许可证。如需开源或分发，请先补充明确的 License 文件。
