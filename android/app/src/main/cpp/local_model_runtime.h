#pragma once

#include <string>

namespace birdsound {

struct RuntimeStatus {
    bool llamaReady;
    bool whisperReady;
    std::string message;
};

RuntimeStatus getRuntimeStatus();

std::string transcribeAudio(const std::string &modelPath, const std::string &audioPath, const std::string &language);

std::string runChat(const std::string &modelId, const std::string &modelPath, const std::string &prompt);

void resetSession(const std::string &modelId);

}  // namespace birdsound
