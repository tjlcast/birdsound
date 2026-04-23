#include "local_model_runtime.h"

#include <jni.h>
#include <string>

namespace {

std::string toString(JNIEnv *env, jstring value) {
    if (value == nullptr) {
        return "";
    }

    const char *chars = env->GetStringUTFChars(value, nullptr);
    std::string result(chars == nullptr ? "" : chars);

    if (chars != nullptr) {
        env->ReleaseStringUTFChars(value, chars);
    }

    return result;
}

jstring makeString(JNIEnv *env, const std::string &value) {
    return env->NewStringUTF(value.c_str());
}

void throwJavaError(JNIEnv *env, const std::string &message) {
    jclass exceptionClass = env->FindClass("java/lang/IllegalStateException");

    if (exceptionClass != nullptr) {
        env->ThrowNew(exceptionClass, message.c_str());
    }
}

}  // namespace

extern "C" JNIEXPORT jboolean JNICALL
Java_com_example_bird_1sound_localmodels_LocalModelNativeBridge_nativeIsReady(JNIEnv *, jclass) {
    const birdsound::RuntimeStatus status = birdsound::getRuntimeStatus();
    return status.llamaReady || status.whisperReady ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_example_bird_1sound_localmodels_LocalModelNativeBridge_nativeGetStatusMessage(JNIEnv *env, jclass) {
    return makeString(env, birdsound::getRuntimeStatus().message);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_example_bird_1sound_localmodels_LocalModelNativeBridge_nativeTranscribe(
    JNIEnv *env,
    jclass,
    jstring modelPath,
    jstring audioPath,
    jstring language
) {
    try {
        return makeString(
            env,
            birdsound::transcribeAudio(toString(env, modelPath), toString(env, audioPath), toString(env, language))
        );
    } catch (const std::exception &error) {
        throwJavaError(env, error.what());
        return nullptr;
    }
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_example_bird_1sound_localmodels_LocalModelNativeBridge_nativeChat(
    JNIEnv *env,
    jclass,
    jstring modelId,
    jstring modelPath,
    jstring prompt
) {
    try {
        return makeString(env, birdsound::runChat(toString(env, modelId), toString(env, modelPath), toString(env, prompt)));
    } catch (const std::exception &error) {
        throwJavaError(env, error.what());
        return nullptr;
    }
}

extern "C" JNIEXPORT void JNICALL
Java_com_example_bird_1sound_localmodels_LocalModelNativeBridge_nativeResetSession(JNIEnv *env, jclass, jstring modelId) {
    birdsound::resetSession(toString(env, modelId));
}
