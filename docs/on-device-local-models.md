# 端侧本地模型集成文档

本文档记录 BirdSound Android 端侧模型实验功能的设计、架构、操作命令、关键文件和后续维护入口。目标是让后续维护者能清楚理解当前实现如何从 React 调用到 Capacitor Plugin、Android Java、C++ JNI，再到 llama.cpp runtime。

## 当前状态

已完成：

- 在“设置 > 实验”页面新增端侧模型实验台。
- 支持从 Android 手机文件中选择并导入模型文件。
- 模型文件由 Android 层复制并管理到 App 私有目录。
- 已接入 `llama.cpp`，可用于 GGUF 文本对话。
- 已接入 `whisper.cpp`，可用 `ggml-small.bin` 做本地语音转文字。
- 已实现 JS -> Capacitor Plugin -> Android Java -> C++ JNI -> llama.cpp / whisper.cpp 的调用链路。
- 原有 `/analyze` 鸟声识别流程保持不变，仍由 `src/services/api.ts` 调后端。

未完成：

- `Qwen3VL-2B-Instruct-Q4_K_M.gguf` 当前只按文本 GGUF 调用；图像输入、multimodal projector、图片预处理尚未接入，因此还不能完成真正的视觉语言问答。
- 当前对话为同步一次性返回，不是 token 流式输出。

注意：当前 `nativeReady` 表示 native library 已加载且本地 runtime 可用。更细的后端状态说明在 `nativeStatus` 中返回。

## 目标模型

| 功能 | 文件名 | 当前状态 |
| --- | --- | --- |
| 文本对话 | `qwen2-0_5b-instruct-q8_0.gguf` | 已接入 llama.cpp 文本调用 |
| 视觉语言 | `Qwen3VL-2B-Instruct-Q4_K_M.gguf` | 仅文本 prompt；未接图片输入 |
| 语音转文字 | `ggml-small.bin` | 已接入 whisper.cpp；Android 层会先把手机音频解码为 WAV 再交给 native |

## 架构分层

```text
React + TypeScript
  src/App.tsx
  src/services/localModels.ts
        |
        | Capacitor registerPlugin("LocalModel")
        v
Android Java Plugin
  LocalModelPlugin.java
  LocalModelNativeBridge.java
  LocalModelDefinition.java
        |
        | JNI
        v
C++ Native Runtime
  local_model_jni.cpp
  local_model_runtime.h
  local_model_runtime.cpp
        |
        | CMake target_link_libraries(... llama whisper ...)
        v
llama.cpp / whisper.cpp / ggml
  android/app/src/main/cpp/third_party/llama.cpp
  android/app/src/main/cpp/third_party/whisper.cpp
```

职责划分：

- React 只负责 UI、按钮、状态展示和调用插件。
- `src/services/localModels.ts` 只负责封装 Capacitor 插件方法。
- Android Java 负责文件选择、私有目录、线程调度和错误回传。
- C++ JNI 负责 Java/C++ 字符串转换、异常桥接和调用 runtime。
- C++ runtime 负责真正的模型加载、音频解码、tokenize、decode、采样生成和 whisper 转写。
- 模型文件路径由 Android 层管理，JS 不直接拼接或持久化真实路径。

## 关键文件

### 前端

- `src/services/localModels.ts`
  - 注册 `LocalModel` Capacitor 插件。
  - 定义模型 ID、模型文件名和 TypeScript 类型。
  - 暴露：
    - `getLocalModelStatus`
    - `pickAndImportLocalModel`
    - `pickAndTranscribeAudio`
    - `runLocalModelChat`
    - `resetLocalModelSession`

- `src/App.tsx`
  - “设置 > 实验”页面 UI。
  - 模型导入按钮。
  - 语音转文字入口。
  - Qwen2/Qwen3VL 文本对话入口。
  - 显示 native runtime 状态和错误消息。

### Android Java

- `android/app/src/main/java/com/example/bird_sound/MainActivity.java`
  - 注册 `LocalModelPlugin`。

- `android/app/src/main/java/com/example/bird_sound/localmodels/LocalModelPlugin.java`
  - Capacitor 插件主体。
  - 通过 `ACTION_OPEN_DOCUMENT` 选择模型或音频文件。
  - 复制模型到 App 私有目录。
  - 使用单线程 executor 调用 native 层。
  - 暴露给 JS 的方法：
    - `getStatus`
    - `pickAndImportModel`
    - `pickAndTranscribeAudio`
    - `chat`
    - `resetSession`

- `android/app/src/main/java/com/example/bird_sound/localmodels/LocalModelNativeBridge.java`
  - 加载 `birdsound_local_models` native library。
  - 声明 JNI 方法。
  - 将 Java 调用转发给 C++。

- `android/app/src/main/java/com/example/bird_sound/localmodels/LocalModelDefinition.java`
  - 模型元数据定义。

### C++ Native

- `android/app/src/main/cpp/CMakeLists.txt`
  - 配置 CMake。
  - 引入 `third_party/llama.cpp`。
  - 引入 `third_party/whisper.cpp`。
  - 构建 `birdsound_local_models` shared library。
  - 链接 `llama`、`whisper`、`android`、`log`。

- `android/app/src/main/cpp/local_model_jni.cpp`
  - JNI 桥接层。
  - 负责：
    - `jstring` 转 `std::string`
    - `std::string` 转 `jstring`
    - C++ 异常转 Java `IllegalStateException`
    - 调用 `local_model_runtime.cpp`

- `android/app/src/main/cpp/local_model_runtime.h`
  - native runtime 接口定义。

- `android/app/src/main/cpp/local_model_runtime.cpp`
  - 当前 llama.cpp 文本对话实现。
  - 当前 whisper.cpp 语音转文字实现。
  - 后续 Qwen3VL multimodal 的主要扩展点。

- `android/app/src/main/cpp/third_party/llama.cpp`
  - 从 `android/llama.zip` 解出的 llama.cpp 源码子集。

- `android/app/src/main/cpp/third_party/whisper.cpp`
  - 从根目录 `whisper.cpp.zip` 解出的 whisper.cpp 源码子集。

## 模型文件导入流程

1. 用户打开 Android App。
2. 点击右上角设置按钮。
3. 进入“实验”。
4. 点击对应模型条目。
5. Android 文件选择器打开。
6. 用户从手机文件中选择模型文件。
7. `LocalModelPlugin` 将所选文件复制到：

   ```text
   /data/data/com.example.bird_sound/files/local-models/
   ```

8. 插件返回模型状态给 React。
9. React 实验页显示“已导入”和文件大小。

实际路径由 Android 的 `getFilesDir()` 决定。在部分系统或工具中，同一目录也可能显示为：

```text
/data/user/0/com.example.bird_sound/files/local-models/
```

当前导入逻辑不解析或校验模型内容，也不强制校验原始文件名；它会把用户选择的文件复制为该模型定义中的目标文件名。例如导入 `qwen2Chat` 时，最终文件名固定为 `qwen2-0_5b-instruct-q8_0.gguf`。因此需要用户自己选择正确模型文件。

音频文件转写入口会把音频复制到：

```text
/data/data/com.example.bird_sound/files/local-audio/
```

同理，音频目录在部分系统中可能显示为 `/data/user/0/com.example.bird_sound/files/local-audio/`。

## Native 语音转文字流程

当前 `transcribeAudio(...)` 的逻辑在 `local_model_runtime.cpp` 中：

1. 加锁，保证同一时间只有一个 native 推理任务运行。
2. 按 `ggml-small.bin` 的私有目录路径加载或复用 whisper session。
3. Android Java 层使用 `MediaExtractor` / `MediaCodec` 读取手机音频文件，包含常见的 `m4a` / `aac`。
4. Java 层将解码出的 PCM 下混为 mono，并写成 WAV 文件到 App 私有音频目录。
5. Native 层使用 `miniaudio` 读取这个 WAV，并转换为 whisper 需要的 16 kHz、mono、float PCM。
6. 使用 greedy sampling 创建 whisper 参数。
7. 默认语言为 `zh`，即中文识别；后续如需自动检测或多语言 UI，可以把 language 参数从 React 暴露出来。
8. 调用：

   ```cpp
   whisper_full(...)
   ```

9. 循环读取所有 segment：

   ```cpp
   whisper_full_n_segments(...)
   whisper_full_get_segment_text(...)
   ```

10. 拼接文本并返回给 Java。
11. Java 返回给 Capacitor。
12. React 实验页显示转写文本。

当前做法是 Android 先解码，native 再统一读 WAV。这样比直接把 `m4a` 丢给 `miniaudio` 更稳定；如果某些厂商系统的 codec 仍无法解特定音频，实验页会返回“语音转文字失败：...”并带出 Android 解码阶段的错误信息。

## Native 文本对话流程

当前 `runChat(...)` 的逻辑在 `local_model_runtime.cpp` 中：

1. 加锁，保证同一时间只有一个 native 推理任务运行。
2. 初始化 llama backend：

   ```cpp
   llama_backend_init();
   ```

3. 按 `modelId` 查找或创建 session。
4. 如果模型路径变化，则释放旧模型并重新加载：

   ```cpp
   llama_model_load_from_file(...)
   ```

5. 创建 context：

   ```cpp
   llama_init_from_model(...)
   ```

6. 创建 sampler chain：

   - top-k
   - top-p
   - temperature
   - dist sampler

7. 格式化 Qwen chat prompt：

   ```text
   <|im_start|>system
   You are a helpful mobile AI assistant...
   <|im_end|>
   <|im_start|>user
   用户输入
   <|im_end|>
   <|im_start|>assistant
   ```

8. 调用 `llama_tokenize(...)`。
9. 调用 `llama_decode(...)` 处理 prompt。
10. 循环采样 token：

    ```cpp
    llama_sampler_sample(...)
    llama_sampler_accept(...)
    llama_token_to_piece(...)
    llama_decode(...)
    ```

11. 拼接文本并返回给 Java。
12. Java 返回给 Capacitor。
13. React 显示模型回复。

当前实现每次 `runChat(...)` 前都会调用 `llama_memory_clear(...)` 清理上下文记忆，因此一次请求只基于当前 prompt 生成回复；`resetSession(...)` 主要用于释放已加载的模型、context 和 sampler，而不是清理多轮聊天历史。

当前默认参数：

| 参数 | 值 |
| --- | --- |
| context size | `2048` |
| batch size | `512` |
| prompt token 上限 | `1536` |
| 生成 token 上限 | `256` |
| 线程数 | 根据硬件动态取 2 到 4 |

采样参数：

| 参数 | 值 |
| --- | --- |
| top-k | `40` |
| top-p | `0.9` |
| temperature | `0.7` |
| seed | `LLAMA_DEFAULT_SEED` |

当前 prompt 格式是代码中手写的 Qwen ChatML 风格模板，没有调用 llama.cpp 的 chat template 解析能力。后续如果要兼容更多模型，建议改为读取模型自带 chat template 或在 Android 层按模型类型维护模板。

## 构建命令

前端类型检查：

```bash
npm run lint
```

前端生产构建：

```bash
npm run build
```

Android Debug APK：

```bash
cd android
/usr/bin/env JAVA_HOME=/Users/jialiangtang/app/jdk-21.0.7+6/Contents/Home ./gradlew :app:assembleDebug
```

Debug APK 输出：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

当前验证结果：

- `npm run lint` 通过。
- `npm run build` 通过。
- `./gradlew :app:assembleDebug` 通过。

仓库中还有一个 `build-all.sh`，会执行 `npm run build`、`npx cap sync android`、`npx cap open android` 和 Android debug 构建。它更偏本机快捷脚本；在 CI 或无 GUI 环境中，建议直接使用上面的显式命令，尤其是不要依赖 `npx cap open android`。

## 为什么不用手动执行 cmake / make

这个项目是 Android App 工程，不是独立的纯 C++ 工程。JNI/C++ 代码虽然由 CMake 组织，但实际构建由 Gradle 通过 Android Gradle Plugin 自动触发。

整体链路是：

```text
./gradlew :app:assembleDebug
        |
        v
Android Gradle Plugin
        |
        v
读取 android/app/build.gradle 中的 externalNativeBuild
        |
        v
调用 CMake 配置 android/app/src/main/cpp/CMakeLists.txt
        |
        v
调用 Ninja/NDK clang 编译 C++ 和 JNI
        |
        v
生成 libbirdsound_local_models.so
        |
        v
把 .so 打包进 APK
```

关键配置在 `android/app/build.gradle`：

```gradle
defaultConfig {
    externalNativeBuild {
        cmake {
            cppFlags "-std=c++17"
        }
    }
}

externalNativeBuild {
    cmake {
        path "src/main/cpp/CMakeLists.txt"
    }
}
```

这两段告诉 Android Gradle Plugin：

- 当前 Android app 有 native C++ 代码。
- native 构建系统使用 CMake。
- CMake 入口文件是 `android/app/src/main/cpp/CMakeLists.txt`。

因此执行：

```bash
cd android
/usr/bin/env JAVA_HOME=/Users/jialiangtang/app/jdk-21.0.7+6/Contents/Home ./gradlew :app:assembleDebug
```

Gradle 会自动生成并执行类似这些任务：

```text
:app:configureCMakeDebug[arm64-v8a]
:app:buildCMakeDebug[arm64-v8a]
:app:configureCMakeDebug[armeabi-v7a]
:app:buildCMakeDebug[armeabi-v7a]
:app:configureCMakeDebug[x86]
:app:buildCMakeDebug[x86]
:app:configureCMakeDebug[x86_64]
:app:buildCMakeDebug[x86_64]
```

这些任务就是 Android 构建系统替开发者执行 CMake 配置和 native 编译。

现代 Android NDK 默认通常不是直接用 `make`，而是通过 CMake 生成 Ninja 构建文件，再由 Ninja 调用 NDK 的 `clang` / `clang++` 编译：

```text
Gradle -> CMake -> Ninja -> NDK clang/clang++ -> .so -> APK
```

中间构建产物通常在：

```text
android/app/.cxx/
android/app/build/
```

这些目录是本机缓存和构建产物，不应该提交到 Git。

什么时候需要手动执行 CMake：

- 单独调试一个纯 C++ library，不走 Android APK 构建。
- 想在 Android 工程外面做快速 native 原型验证。
- 需要手工复现 CMake 配置问题。

正常开发 Android JNI 时，一般只需要改 `CMakeLists.txt` 和 C++ 源码，然后执行 Gradle 构建命令即可。

## 环境要求

- Node.js 20+。
- npm 10+。
- Android Studio / Android SDK。
- JDK 21。
- Android NDK，由 Gradle/Android SDK 管理。

当前已验证的 JDK 路径：

```text
/Users/jialiangtang/app/jdk-21.0.7+6/Contents/Home
```

## llama.cpp 接入方式

用户提供的压缩包：

```text
android/llama.zip
```

压缩包内容是 `llama.cpp-b8191`。

已解出的源码位置：

```text
android/app/src/main/cpp/third_party/llama.cpp
```

当前只保留构建 native library 所需的主要源码目录：

- `CMakeLists.txt`
- `cmake/`
- `ggml/`
- `include/`
- `src/`
- `common/`
- `vendor/`
- `LICENSE`

`android/llama.zip` 已在 `.gitignore` 中忽略，不应提交压缩包。

其中 `common/` 和 `vendor/` 已随源码子集保留，方便后续扩展到 chat template、采样 helper 或示例代码；但当前 CMake 设置了 `LLAMA_BUILD_COMMON OFF`，所以当前 `birdsound_local_models` 只链接 `llama` 目标及其 ggml 依赖，没有链接 llama.cpp 的 `common` target。

## whisper.cpp 接入方式

用户提供的压缩包：

```text
whisper.cpp.zip
```

压缩包内容是 `whisper.cpp`。

已解出的源码位置：

```text
android/app/src/main/cpp/third_party/whisper.cpp
```

当前只保留构建本地转写所需的主要源码和一个音频解码 helper：

- `CMakeLists.txt`
- `cmake/`
- `include/`
- `src/`
- `examples/miniaudio.h`
- `LICENSE`

`whisper.cpp.zip` 已在 `.gitignore` 中忽略，不应提交压缩包。

当前 CMake 先引入 llama.cpp，再引入 whisper.cpp。因为 llama.cpp 已经注册了 `ggml` target，whisper.cpp 的 CMake 会复用已有 `ggml` target，而不会再次构建一份同名 ggml。这样可以避免重复 target 和重复符号，但也意味着 whisper.cpp 与 llama.cpp 使用的是同一份 ggml 实现；升级其中一个第三方库时，需要重新跑 Android native 构建确认 API 仍兼容。

## CMake 说明

当前 `android/app/src/main/cpp/CMakeLists.txt` 关键配置：

```cmake
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_CURL OFF CACHE BOOL "" FORCE)
set(LLAMA_OPENSSL OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(WHISPER_CURL OFF CACHE BOOL "" FORCE)
set(WHISPER_SDL2 OFF CACHE BOOL "" FORCE)
set(WHISPER_COREML OFF CACHE BOOL "" FORCE)
set(WHISPER_OPENVINO OFF CACHE BOOL "" FORCE)
set(WHISPER_ALL_WARNINGS OFF CACHE BOOL "" FORCE)

add_subdirectory(third_party/llama.cpp build-llama EXCLUDE_FROM_ALL)
add_subdirectory(third_party/whisper.cpp build-whisper EXCLUDE_FROM_ALL)
```

原因：

- 不构建 llama.cpp 的工具、示例、测试、server，减少构建体积和时间。
- 不构建 whisper.cpp 的示例、测试、server 和可选后端，减少额外依赖。
- 当前没有链接 llama.cpp 的 `common` target，因此 `LLAMA_BUILD_COMMON OFF`。
- 不启用 OpenSSL/CURL，避免 Android native 额外依赖。
- 不启用 OpenMP，避免额外运行时依赖。
- 不启用 `GGML_NATIVE`，让构建更适合多 ABI。
- `BUILD_SHARED_LIBS OFF` 让 llama/ggml 作为静态库参与链接，最终主要产物仍是 App 自己的 `libbirdsound_local_models.so`。

当前链接：

```cmake
target_link_libraries(
    birdsound_local_models
    PRIVATE
    llama
    whisper
    android
    log
)
```

## 当前 APK/native 体积观察

Debug APK 约：

```text
44M
```

接入 whisper.cpp 后，Debug native so 曾观察到 arm64-v8a 约：

```text
67M
```

不同 ABI 的 debug so 体积会略有差异：

- `arm64-v8a`
- `armeabi-v7a`
- `x86`
- `x86_64`

发布真机版本时，可以考虑只保留 `arm64-v8a`，以减少构建时间和包体。

如果只保留 `arm64-v8a`，需要确认目标设备全部是 64 位 ARM。现代真机通常满足，但模拟器或旧设备可能需要 `x86_64` / `armeabi-v7a`。

## 后续增强 whisper.cpp

whisper.cpp 已经接入，后续主要增强点是体验和音频兼容性：

1. 增加语言选择或自动检测，而不是固定默认 `zh`。
2. 增加转写进度回调；当前是同步等待完整结果返回。
3. 对长音频做分段、取消和超时控制。
4. 针对特别长的 `m4a` / `aac`，增加分段解码和进度回调。
5. 根据设备性能调整线程数、beam search/greedy 策略和是否保留上下文。

## 后续接入 Qwen3VL 图片输入

当前 `qwen3Vision` 只是把 prompt 送进 llama.cpp 文本生成流程。真正的视觉语言调用还需要：

- 图片选择 UI。
- Android Java 层复制图片到私有目录。
- native 层图片读取和预处理。
- Qwen3VL 对应的 multimodal projector / vision encoder 支持。
- prompt 中插入图像 token 或 llama.cpp multimodal API 所需结构。

建议新增独立方法，不要复用纯文本 `chat(...)`：

```ts
visionChat({
  modelId: 'qwen3Vision',
  prompt: string,
  imagePath: string
})
```

对应 Android/JNI/runtime 也单独拆方法，避免污染文本对话链路。

## 常见问题

### Android 构建提示 Java 版本不对

当前工程需要 JDK 21。使用：

```bash
cd android
/usr/bin/env JAVA_HOME=/Users/jialiangtang/app/jdk-21.0.7+6/Contents/Home ./gradlew :app:assembleDebug
```

### 实验页提示 native 未就绪

可能原因：

- APK 中没有正确打包 `libbirdsound_local_models.so`。
- native library 加载失败。
- llama.cpp / whisper.cpp native target 未正确链接或初始化。

检查：

- `LocalModelNativeBridge.java`
- `nativeGetStatusMessage`
- Android logcat 中 `BirdSoundLocalModel` 日志。

### 导入模型成功但对话失败

可能原因：

- 模型文件不完整。
- 导入时选错了文件；当前只按目标文件名保存，不校验 GGUF 内容是否匹配该模型。
- 设备内存不足。
- context size 过大。
- 模型架构当前 llama.cpp 版本不支持。
- prompt 模板不适配该模型。

可尝试：

- 使用更小的 GGUF。
- 将 `kContextSize` 从 `2048` 降到 `1024`。
- 将 `kMaxGeneratedTokens` 从 `256` 降到 `128`。
- 确认导入的文件确实是对应的 GGUF 模型。
- 对非 Qwen ChatML 模型，调整 `formatPrompt(...)`。

### 导入 ggml-small.bin 成功但转写失败

可能原因：

- 模型文件不完整，或导入时选错了文件。
- Android 系统 codec 无法解码该音频，或文件本身损坏。
- 音频太长导致内存或耗时过高。
- 设备内存不足。

可尝试：

- 先用短的 `wav` 或 `mp3` 文件验证链路。
- 确认导入的文件确实是 whisper.cpp 的 `ggml-small.bin`。
- 换一个由系统相册/录音机正常导出的短音频验证。

### Debug 构建太慢

当前会构建 4 个 ABI。可考虑在 `android/app/build.gradle` 中只保留真机需要的 ABI，例如：

```gradle
ndk {
    abiFilters "arm64-v8a"
}
```

这会明显减少 native 构建时间和 APK 体积。

## 维护原则

- 不要把模型文件提交到 Git。
- 不要提交 `android/llama.zip`。
- 不要提交 `whisper.cpp.zip`。
- 原 `/analyze` 流程只用于服务端鸟声识别，不要和端侧实验混用。
- 新增 native 后端时优先扩展 `local_model_runtime.cpp`，不要把业务逻辑塞进 `local_model_jni.cpp`。
- JS 不直接管理模型真实路径，路径由 Android 层维护。
- Native 状态展示要区分“llama 可用”和“whisper 可用”，不要把 `nativeReady` 理解成所有后端都可用。
- 如果增加多轮对话，要明确是否复用 KV cache；当前实现会在每次请求前清空 llama memory。
- 端侧实验能力尽量保持在“设置 > 实验”中，避免影响主识别流程稳定性。
