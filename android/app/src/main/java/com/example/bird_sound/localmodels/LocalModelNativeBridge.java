package com.example.bird_sound.localmodels;

class LocalModelNativeBridge {
    private static final boolean LIBRARY_LOADED;

    static {
        boolean loaded;

        try {
            System.loadLibrary("birdsound_local_models");
            loaded = true;
        } catch (UnsatisfiedLinkError error) {
            loaded = false;
        }

        LIBRARY_LOADED = loaded;
    }

    boolean isReady() {
        return LIBRARY_LOADED && nativeIsReady();
    }

    String getStatusMessage() {
        if (!LIBRARY_LOADED) {
            return "birdsound_local_models native library is not loaded.";
        }

        return nativeGetStatusMessage();
    }

    String transcribe(String modelPath, String audioPath, String language) {
        ensureReady();
        return nativeTranscribe(modelPath, audioPath, language);
    }

    String chat(String modelId, String modelPath, String prompt) {
        ensureReady();
        return nativeChat(modelId, modelPath, prompt);
    }

    void resetSession(String modelId) {
        if (isReady()) {
            nativeResetSession(modelId);
        }
    }

    private void ensureReady() {
        if (!isReady()) {
            throw new IllegalStateException("端侧 native 推理库未就绪，请确认 birdsound_local_models 已加载并已接入 llama.cpp / whisper.cpp。");
        }
    }

    private static native boolean nativeIsReady();

    private static native String nativeGetStatusMessage();

    private static native String nativeTranscribe(String modelPath, String audioPath, String language);

    private static native String nativeChat(String modelId, String modelPath, String prompt);

    private static native void nativeResetSession(String modelId);
}
