#include "local_model_runtime.h"

#include "llama.h"
#include "whisper.h"

#include <android/log.h>
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <sstream>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

#define MA_NO_DEVICE_IO
#define MA_NO_THREADING
#define MA_NO_ENCODING
#define MA_NO_GENERATION
#define MA_NO_RESOURCE_MANAGER
#define MA_NO_NODE_GRAPH
#define MINIAUDIO_IMPLEMENTATION
#include "miniaudio.h"

namespace birdsound {
namespace {

constexpr const char *kTag = "BirdSoundLocalModel";
constexpr int kContextSize = 2048;
constexpr int kBatchSize = 512;
constexpr int kMaxPromptTokens = 1536;
constexpr int kMaxGeneratedTokens = 256;

struct LlamaSession {
    std::string modelPath;
    llama_model *model = nullptr;
    llama_context *context = nullptr;
    llama_sampler *sampler = nullptr;
};

struct WhisperSession {
    std::string modelPath;
    whisper_context *context = nullptr;
};

std::mutex g_mutex;
bool g_llamaInitialized = false;
std::unordered_map<std::string, LlamaSession> g_sessions;
WhisperSession g_whisperSession;

void logInfo(const std::string &message) {
    __android_log_write(ANDROID_LOG_INFO, kTag, message.c_str());
}

int threadCount() {
    const unsigned int hardware = std::thread::hardware_concurrency();
    const int detected = hardware == 0 ? 4 : static_cast<int>(hardware);
    return std::max(2, std::min(4, detected - 1));
}

void ensureLlamaInitialized() {
    if (!g_llamaInitialized) {
        llama_log_set(
            [](enum ggml_log_level level, const char *text, void *) {
                const int priority = level == GGML_LOG_LEVEL_ERROR ? ANDROID_LOG_ERROR : ANDROID_LOG_DEBUG;
                __android_log_write(priority, kTag, text);
            },
            nullptr
        );
        llama_backend_init();
        g_llamaInitialized = true;
        logInfo("llama.cpp backend initialized");
    }
}

void freeSession(LlamaSession &session) {
    if (session.sampler != nullptr) {
        llama_sampler_free(session.sampler);
        session.sampler = nullptr;
    }

    if (session.context != nullptr) {
        llama_free(session.context);
        session.context = nullptr;
    }

    if (session.model != nullptr) {
        llama_model_free(session.model);
        session.model = nullptr;
    }

    session.modelPath.clear();
}

void freeWhisperSession() {
    if (g_whisperSession.context != nullptr) {
        whisper_free(g_whisperSession.context);
        g_whisperSession.context = nullptr;
    }

    g_whisperSession.modelPath.clear();
}

WhisperSession &loadWhisperSession(const std::string &modelPath) {
    if (g_whisperSession.context != nullptr && g_whisperSession.modelPath == modelPath) {
        return g_whisperSession;
    }

    freeWhisperSession();

    whisper_context_params contextParams = whisper_context_default_params();
    contextParams.use_gpu = false;

    g_whisperSession.context = whisper_init_from_file_with_params(modelPath.c_str(), contextParams);
    if (g_whisperSession.context == nullptr) {
        throw std::runtime_error("Failed to load Whisper model: " + modelPath);
    }

    g_whisperSession.modelPath = modelPath;
    return g_whisperSession;
}

std::vector<float> decodeAudioFile(const std::string &audioPath) {
    ma_decoder_config config = ma_decoder_config_init(ma_format_f32, 1, WHISPER_SAMPLE_RATE);
    ma_decoder decoder;
    ma_result result = ma_decoder_init_file(audioPath.c_str(), &config, &decoder);

    if (result != MA_SUCCESS) {
        throw std::runtime_error(
            "Failed to decode audio file. Supported formats depend on miniaudio; try WAV, MP3, FLAC, or OGG."
        );
    }

    ma_uint64 frameCount = 0;
    result = ma_decoder_get_length_in_pcm_frames(&decoder, &frameCount);
    if (result != MA_SUCCESS || frameCount == 0) {
        ma_decoder_uninit(&decoder);
        throw std::runtime_error("Failed to read audio length.");
    }

    std::vector<float> pcm(static_cast<size_t>(frameCount));
    ma_uint64 framesRead = 0;
    result = ma_decoder_read_pcm_frames(&decoder, pcm.data(), frameCount, &framesRead);
    ma_decoder_uninit(&decoder);

    if (result != MA_SUCCESS || framesRead == 0) {
        throw std::runtime_error("Failed to read decoded audio frames.");
    }

    pcm.resize(static_cast<size_t>(framesRead));
    return pcm;
}

std::string formatPrompt(const std::string &modelId, const std::string &prompt) {
    if (modelId == "qwen3Vision") {
        return "<|im_start|>system\nYou are a helpful mobile AI assistant. Answer in Chinese unless the user asks otherwise.<|im_end|>\n"
               "<|im_start|>user\n" +
               prompt +
               "\n<|im_end|>\n<|im_start|>assistant\n";
    }

    return "<|im_start|>system\nYou are a helpful mobile AI assistant. Answer in Chinese unless the user asks otherwise.<|im_end|>\n"
           "<|im_start|>user\n" +
           prompt +
           "\n<|im_end|>\n<|im_start|>assistant\n";
}

std::vector<llama_token> tokenize(const llama_vocab *vocab, const std::string &text, bool addSpecial) {
    int32_t tokenCount = llama_tokenize(
        vocab,
        text.c_str(),
        static_cast<int32_t>(text.size()),
        nullptr,
        0,
        addSpecial,
        true
    );

    if (tokenCount == INT32_MIN) {
        throw std::runtime_error("Prompt tokenization overflowed.");
    }

    if (tokenCount < 0) {
        tokenCount = -tokenCount;
    }

    std::vector<llama_token> tokens(static_cast<size_t>(tokenCount));
    const int32_t written = llama_tokenize(
        vocab,
        text.c_str(),
        static_cast<int32_t>(text.size()),
        tokens.data(),
        tokenCount,
        addSpecial,
        true
    );

    if (written < 0) {
        throw std::runtime_error("Prompt tokenization failed.");
    }

    tokens.resize(static_cast<size_t>(written));
    return tokens;
}

std::string tokenToPiece(const llama_vocab *vocab, llama_token token) {
    std::vector<char> buffer(128);
    int32_t size = llama_token_to_piece(vocab, token, buffer.data(), static_cast<int32_t>(buffer.size()), 0, true);

    if (size < 0) {
        buffer.resize(static_cast<size_t>(-size));
        size = llama_token_to_piece(vocab, token, buffer.data(), static_cast<int32_t>(buffer.size()), 0, true);
    }

    if (size <= 0) {
        return "";
    }

    return std::string(buffer.data(), static_cast<size_t>(size));
}

llama_sampler *createSampler() {
    llama_sampler_chain_params samplerParams = llama_sampler_chain_default_params();
    llama_sampler *chain = llama_sampler_chain_init(samplerParams);
    llama_sampler_chain_add(chain, llama_sampler_init_top_k(40));
    llama_sampler_chain_add(chain, llama_sampler_init_top_p(0.9f, 1));
    llama_sampler_chain_add(chain, llama_sampler_init_temp(0.7f));
    llama_sampler_chain_add(chain, llama_sampler_init_dist(LLAMA_DEFAULT_SEED));
    return chain;
}

LlamaSession &loadSession(const std::string &modelId, const std::string &modelPath) {
    ensureLlamaInitialized();

    LlamaSession &session = g_sessions[modelId];
    if (session.model != nullptr && session.context != nullptr && session.modelPath == modelPath) {
        return session;
    }

    freeSession(session);

    llama_model_params modelParams = llama_model_default_params();
    modelParams.use_mmap = true;
    session.model = llama_model_load_from_file(modelPath.c_str(), modelParams);
    if (session.model == nullptr) {
        throw std::runtime_error("Failed to load GGUF model: " + modelPath);
    }

    llama_context_params contextParams = llama_context_default_params();
    contextParams.n_ctx = kContextSize;
    contextParams.n_batch = kBatchSize;
    contextParams.n_ubatch = kBatchSize;
    contextParams.n_threads = threadCount();
    contextParams.n_threads_batch = contextParams.n_threads;

    session.context = llama_init_from_model(session.model, contextParams);
    if (session.context == nullptr) {
        freeSession(session);
        throw std::runtime_error("Failed to create llama context.");
    }

    session.sampler = createSampler();
    session.modelPath = modelPath;
    return session;
}

}  // namespace

RuntimeStatus getRuntimeStatus() {
    return RuntimeStatus{
        true,
        true,
        "llama.cpp and whisper.cpp backends are linked.",
    };
}

std::string transcribeAudio(const std::string &modelPath, const std::string &audioPath, const std::string &language) {
    std::lock_guard<std::mutex> lock(g_mutex);
    WhisperSession &session = loadWhisperSession(modelPath);
    std::vector<float> pcm = decodeAudioFile(audioPath);

    whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.n_threads = threadCount();
    params.language = language.empty() ? "zh" : language.c_str();
    params.translate = false;
    params.no_context = true;
    params.no_timestamps = true;
    params.print_progress = false;
    params.print_realtime = false;
    params.print_timestamps = false;

    if (whisper_full(session.context, params, pcm.data(), static_cast<int>(pcm.size())) != 0) {
        throw std::runtime_error("Whisper transcription failed.");
    }

    const int segmentCount = whisper_full_n_segments(session.context);
    std::ostringstream text;
    for (int i = 0; i < segmentCount; ++i) {
        const char *segment = whisper_full_get_segment_text(session.context, i);
        if (segment != nullptr) {
            text << segment;
        }
    }

    const std::string result = text.str();
    return result.empty() ? "(Whisper 没有生成可显示的转写文本)" : result;
}

std::string runChat(const std::string &modelId, const std::string &modelPath, const std::string &prompt) {
    std::lock_guard<std::mutex> lock(g_mutex);
    LlamaSession &session = loadSession(modelId, modelPath);
    const llama_vocab *vocab = llama_model_get_vocab(session.model);
    const std::string formattedPrompt = formatPrompt(modelId, prompt);
    std::vector<llama_token> promptTokens = tokenize(vocab, formattedPrompt, true);

    if (promptTokens.empty()) {
        throw std::runtime_error("Prompt produced no tokens.");
    }

    if (promptTokens.size() > kMaxPromptTokens) {
        promptTokens.erase(promptTokens.begin(), promptTokens.end() - kMaxPromptTokens);
    }

    llama_memory_clear(llama_get_memory(session.context), true);

    llama_batch promptBatch = llama_batch_get_one(promptTokens.data(), static_cast<int32_t>(promptTokens.size()));
    if (llama_decode(session.context, promptBatch) != 0) {
        throw std::runtime_error("Failed to decode prompt.");
    }

    std::string output;
    std::vector<llama_token> tokenBuffer(1);

    for (int i = 0; i < kMaxGeneratedTokens; ++i) {
        const llama_token token = llama_sampler_sample(session.sampler, session.context, -1);
        llama_sampler_accept(session.sampler, token);

        if (llama_vocab_is_eog(vocab, token)) {
            break;
        }

        output += tokenToPiece(vocab, token);
        tokenBuffer[0] = token;

        llama_batch nextBatch = llama_batch_get_one(tokenBuffer.data(), 1);
        if (llama_decode(session.context, nextBatch) != 0) {
            throw std::runtime_error("Failed while generating response.");
        }
    }

    return output.empty() ? "(模型没有生成可显示的文本)" : output;
}

void resetSession(const std::string &modelId) {
    std::lock_guard<std::mutex> lock(g_mutex);
    if (modelId == "whisperSmall") {
        freeWhisperSession();
        return;
    }

    auto it = g_sessions.find(modelId);

    if (it != g_sessions.end()) {
        freeSession(it->second);
        g_sessions.erase(it);
    }
}

}  // namespace birdsound
