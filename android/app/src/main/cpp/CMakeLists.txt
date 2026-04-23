cmake_minimum_required(VERSION 3.22.1)

project(birdsound_local_models)

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

# 1. 注册子项目（让 CMake 知道要编译 llama.cpp / whisper.cpp）
# CMake 读取 third_party/llama.cpp/CMakeLists.txt
# 发现其中定义了 add_library(llama ...)
# 注册了一个名为 "llama" 的构建目标
add_subdirectory(third_party/llama.cpp build-llama EXCLUDE_FROM_ALL)
add_subdirectory(third_party/whisper.cpp build-whisper EXCLUDE_FROM_ALL)

# 2. 定义你的库
# 注册了一个名为 "birdsound_local_models" 的构建目标
add_library(
    birdsound_local_models
    SHARED
    local_model_jni.cpp
    local_model_runtime.cpp
)

#编译上面这些源文件时去哪找头文件
target_include_directories(
    birdsound_local_models
    PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party/whisper.cpp/examples
)

# 3. 声明依赖关系
# - 编译 birdsound_local_models 之前，先确保 llama / whisper 已编译
# - 链接时，把 llama / whisper 的符号解析到 birdsound_local_models 中
# - 自动添加相关 include 路径到搜索路径
target_link_libraries(
    birdsound_local_models
    PRIVATE # 只在内部使用，不暴露给依赖我的其他库
    llama
    whisper
    android
    log
)
