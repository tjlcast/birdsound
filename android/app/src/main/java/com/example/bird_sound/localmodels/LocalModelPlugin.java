package com.example.bird_sound.localmodels;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LocalModel")
public class LocalModelPlugin extends Plugin {
    private static final String MODEL_DIR_NAME = "local-models";
    private static final String AUDIO_DIR_NAME = "local-audio";
    private static final String CALL_MODEL_ID = "modelId";

    private final Map<String, LocalModelDefinition> modelDefinitions = new LinkedHashMap<>();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final LocalModelNativeBridge nativeBridge = new LocalModelNativeBridge();

    @Override
    public void load() {
        modelDefinitions.put(
            "whisperSmall",
            new LocalModelDefinition("whisperSmall", "语音转文字", "ggml-small.bin", "whisper.cpp")
        );
        modelDefinitions.put(
            "qwen2Chat",
            new LocalModelDefinition("qwen2Chat", "文本对话", "qwen2-0_5b-instruct-q8_0.gguf", "llama.cpp")
        );
        modelDefinitions.put(
            "qwen3Vision",
            new LocalModelDefinition("qwen3Vision", "视觉语言", "Qwen3VL-2B-Instruct-Q4_K_M.gguf", "llama.cpp / multimodal")
        );
        ensureDirectory(getModelDirectory());
        ensureDirectory(getAudioDirectory());
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(buildStatus());
    }

    @PluginMethod
    public void pickAndImportModel(PluginCall call) {
        String modelId = call.getString(CALL_MODEL_ID);

        if (!modelDefinitions.containsKey(modelId)) {
            call.reject("未知模型：" + modelId);
            return;
        }

        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(call, intent, "handleImportModelResult");
    }

    @PluginMethod
    public void pickAndTranscribeAudio(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("audio/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(call, intent, "handleTranscribeAudioResult");
    }

    @PluginMethod
    public void chat(PluginCall call) {
        String modelId = call.getString(CALL_MODEL_ID, "qwen2Chat");
        String prompt = call.getString("prompt", "").trim();
        LocalModelDefinition definition = modelDefinitions.get(modelId);

        if (definition == null || "whisperSmall".equals(modelId)) {
            call.reject("请选择可用于对话的 GGUF 模型。");
            return;
        }

        if (prompt.length() == 0) {
            call.reject("请输入要发送给端侧模型的内容。");
            return;
        }

        File modelFile = getModelFile(definition);
        if (!modelFile.exists()) {
            call.reject("请先导入模型文件：" + definition.fileName);
            return;
        }

        executor.execute(() -> {
            try {
                String text = nativeBridge.chat(modelId, modelFile.getAbsolutePath(), prompt);
                JSObject result = new JSObject();
                result.put("text", text);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(error.getMessage(), error);
            }
        });
    }

    @PluginMethod
    public void resetSession(PluginCall call) {
        String modelId = call.getString(CALL_MODEL_ID, "qwen2Chat");

        executor.execute(() -> {
            nativeBridge.resetSession(modelId);
            call.resolve();
        });
    }

    @ActivityCallback
    private void handleImportModelResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("未选择模型文件。");
            return;
        }

        String modelId = call.getString(CALL_MODEL_ID);
        LocalModelDefinition definition = modelDefinitions.get(modelId);
        Uri uri = result.getData().getData();

        executor.execute(() -> {
            try {
                File outputFile = getModelFile(definition);
                copyUriToFile(uri, outputFile);
                call.resolve(buildModelStatus(definition));
            } catch (Exception error) {
                call.reject("导入模型失败：" + error.getMessage(), error);
            }
        });
    }

    @ActivityCallback
    private void handleTranscribeAudioResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("未选择音频文件。");
            return;
        }

        LocalModelDefinition definition = modelDefinitions.get("whisperSmall");
        File modelFile = getModelFile(definition);

        if (!modelFile.exists()) {
            call.reject("请先导入模型文件：" + definition.fileName);
            return;
        }

        Uri uri = result.getData().getData();
        String language = call.getString("language", "zh");
        boolean preprocessAudio = call.getBoolean("preprocessAudio", true);

        executor.execute(() -> {
            try {
                File audioFile = preprocessAudio ? prepareAudioForWhisper(uri) : copyAudioForNativeWhisper(uri);
                String text = nativeBridge.transcribe(modelFile.getAbsolutePath(), audioFile.getAbsolutePath(), language);
                JSObject response = new JSObject();
                response.put("text", text);
                response.put("audioPath", audioFile.getAbsolutePath());
                call.resolve(response);
            } catch (Exception error) {
                call.reject("语音转文字失败：" + error.getMessage(), error);
            }
        });
    }

    private JSObject buildStatus() {
        JSObject status = new JSObject();
        JSArray models = new JSArray();

        for (LocalModelDefinition definition : modelDefinitions.values()) {
            models.put(buildModelStatus(definition));
        }

        status.put("nativeReady", nativeBridge.isReady());
        status.put("nativeStatus", nativeBridge.getStatusMessage());
        status.put("modelDirectory", getModelDirectory().getAbsolutePath());
        status.put("models", models);
        return status;
    }

    private JSObject buildModelStatus(LocalModelDefinition definition) {
        File file = getModelFile(definition);
        JSObject status = new JSObject();
        status.put("id", definition.id);
        status.put("label", definition.label);
        status.put("fileName", definition.fileName);
        status.put("role", definition.role);
        status.put("imported", file.exists());

        if (file.exists()) {
            status.put("path", file.getAbsolutePath());
            status.put("sizeBytes", file.length());
        }

        return status;
    }

    private File getModelDirectory() {
        return new File(getContext().getFilesDir(), MODEL_DIR_NAME);
    }

    private File getAudioDirectory() {
        return new File(getContext().getFilesDir(), AUDIO_DIR_NAME);
    }

    private File getModelFile(LocalModelDefinition definition) {
        return new File(getModelDirectory(), definition.fileName);
    }

    private void ensureDirectory(File directory) {
        if (!directory.exists()) {
            directory.mkdirs();
        }
    }

    private void copyUriToFile(Uri uri, File outputFile) throws Exception {
        ensureDirectory(outputFile.getParentFile());

        try (
            InputStream input = getContext().getContentResolver().openInputStream(uri);
            FileOutputStream output = new FileOutputStream(outputFile, false)
        ) {
            if (input == null) {
                throw new IllegalStateException("无法读取所选文件。");
            }

            byte[] buffer = new byte[1024 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
        }
    }

    private File prepareAudioForWhisper(Uri uri) throws Exception {
        String displayName = sanitizeFileName(getDisplayName(uri, "audio"));
        File wavFile = new File(getAudioDirectory(), System.currentTimeMillis() + "-" + displayName + ".wav");
        decodeUriToMonoWav(uri, wavFile);
        return wavFile;
    }

    private File copyAudioForNativeWhisper(Uri uri) throws Exception {
        String displayName = sanitizeFileName(getDisplayName(uri, "audio.wav"));
        File audioFile = new File(getAudioDirectory(), System.currentTimeMillis() + "-" + displayName);
        copyUriToFile(uri, audioFile);
        return audioFile;
    }

    private void decodeUriToMonoWav(Uri uri, File wavFile) throws Exception {
        ensureDirectory(wavFile.getParentFile());

        MediaExtractor extractor = new MediaExtractor();
        MediaCodec codec = null;
        RandomAccessFile output = null;

        try {
            extractor.setDataSource(getContext(), uri, null);
            int audioTrack = findAudioTrack(extractor);

            if (audioTrack < 0) {
                throw new IllegalStateException("所选文件中没有可解码的音频轨道。");
            }

            extractor.selectTrack(audioTrack);
            MediaFormat format = extractor.getTrackFormat(audioTrack);
            String mime = format.getString(MediaFormat.KEY_MIME);

            if (mime == null || !mime.startsWith("audio/")) {
                throw new IllegalStateException("所选文件不是 Android 可识别的音频格式。");
            }

            int sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE);
            int channelCount = format.containsKey(MediaFormat.KEY_CHANNEL_COUNT) ? format.getInteger(MediaFormat.KEY_CHANNEL_COUNT) : 1;
            int pcmEncoding = AudioFormat.ENCODING_PCM_16BIT;

            codec = MediaCodec.createDecoderByType(mime);
            codec.configure(format, null, null, 0);
            codec.start();

            output = new RandomAccessFile(wavFile, "rw");
            output.setLength(0);
            writeWavHeader(output, sampleRate, 1, 0);

            MediaCodec.BufferInfo bufferInfo = new MediaCodec.BufferInfo();
            boolean inputDone = false;
            boolean outputDone = false;
            long pcmBytesWritten = 0;

            while (!outputDone) {
                if (!inputDone) {
                    int inputIndex = codec.dequeueInputBuffer(10_000);

                    if (inputIndex >= 0) {
                        ByteBuffer inputBuffer = codec.getInputBuffer(inputIndex);

                        if (inputBuffer == null) {
                            throw new IllegalStateException("无法获取音频解码输入缓冲区。");
                        }

                        inputBuffer.clear();
                        int sampleSize = extractor.readSampleData(inputBuffer, 0);

                        if (sampleSize < 0) {
                            codec.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            inputDone = true;
                        } else {
                            codec.queueInputBuffer(inputIndex, 0, sampleSize, extractor.getSampleTime(), 0);
                            extractor.advance();
                        }
                    }
                }

                int outputIndex = codec.dequeueOutputBuffer(bufferInfo, 10_000);

                if (outputIndex >= 0) {
                    if (bufferInfo.size > 0) {
                        ByteBuffer outputBuffer = codec.getOutputBuffer(outputIndex);

                        if (outputBuffer == null) {
                            throw new IllegalStateException("无法获取音频解码输出缓冲区。");
                        }

                        outputBuffer.position(bufferInfo.offset);
                        outputBuffer.limit(bufferInfo.offset + bufferInfo.size);
                        ByteBuffer pcm = outputBuffer.slice().order(ByteOrder.LITTLE_ENDIAN);
                        pcmBytesWritten += writeMonoPcm16(output, pcm, channelCount, pcmEncoding);
                    }

                    outputDone = (bufferInfo.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
                    codec.releaseOutputBuffer(outputIndex, false);
                } else if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat outputFormat = codec.getOutputFormat();
                    sampleRate = outputFormat.containsKey(MediaFormat.KEY_SAMPLE_RATE)
                        ? outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                        : sampleRate;
                    channelCount = outputFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)
                        ? outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                        : channelCount;
                    pcmEncoding = outputFormat.containsKey(MediaFormat.KEY_PCM_ENCODING)
                        ? outputFormat.getInteger(MediaFormat.KEY_PCM_ENCODING)
                        : AudioFormat.ENCODING_PCM_16BIT;
                }
            }

            if (pcmBytesWritten == 0) {
                throw new IllegalStateException("音频解码结果为空。");
            }

            output.seek(0);
            writeWavHeader(output, sampleRate, 1, pcmBytesWritten);
        } finally {
            if (output != null) {
                output.close();
            }

            if (codec != null) {
                codec.stop();
                codec.release();
            }

            extractor.release();
        }
    }

    private int findAudioTrack(MediaExtractor extractor) {
        for (int i = 0; i < extractor.getTrackCount(); i += 1) {
            MediaFormat format = extractor.getTrackFormat(i);
            String mime = format.getString(MediaFormat.KEY_MIME);

            if (mime != null && mime.startsWith("audio/")) {
                return i;
            }
        }

        return -1;
    }

    private long writeMonoPcm16(RandomAccessFile output, ByteBuffer pcm, int channelCount, int pcmEncoding) throws Exception {
        int channels = Math.max(1, channelCount);

        if (pcmEncoding == AudioFormat.ENCODING_PCM_FLOAT) {
            int frameCount = pcm.remaining() / (channels * 4);
            byte[] mono = new byte[frameCount * 2];

            for (int frame = 0; frame < frameCount; frame += 1) {
                float sum = 0;

                for (int channel = 0; channel < channels; channel += 1) {
                    sum += pcm.getFloat();
                }

                int sample = Math.round(clampFloat(sum / channels) * 32767f);
                mono[frame * 2] = (byte) (sample & 0xff);
                mono[frame * 2 + 1] = (byte) ((sample >> 8) & 0xff);
            }

            output.write(mono);
            return mono.length;
        }

        int frameCount = pcm.remaining() / (channels * 2);
        byte[] mono = new byte[frameCount * 2];

        for (int frame = 0; frame < frameCount; frame += 1) {
            int sum = 0;

            for (int channel = 0; channel < channels; channel += 1) {
                sum += pcm.getShort();
            }

            int sample = Math.max(Short.MIN_VALUE, Math.min(Short.MAX_VALUE, sum / channels));
            mono[frame * 2] = (byte) (sample & 0xff);
            mono[frame * 2 + 1] = (byte) ((sample >> 8) & 0xff);
        }

        output.write(mono);
        return mono.length;
    }

    private float clampFloat(float value) {
        return Math.max(-1f, Math.min(1f, value));
    }

    private void writeWavHeader(RandomAccessFile output, int sampleRate, int channelCount, long dataSize) throws Exception {
        long riffSize = 36 + dataSize;
        int byteRate = sampleRate * channelCount * 2;
        byte[] header = new byte[44];

        writeAscii(header, 0, "RIFF");
        writeIntLE(header, 4, (int) riffSize);
        writeAscii(header, 8, "WAVE");
        writeAscii(header, 12, "fmt ");
        writeIntLE(header, 16, 16);
        writeShortLE(header, 20, 1);
        writeShortLE(header, 22, channelCount);
        writeIntLE(header, 24, sampleRate);
        writeIntLE(header, 28, byteRate);
        writeShortLE(header, 32, channelCount * 2);
        writeShortLE(header, 34, 16);
        writeAscii(header, 36, "data");
        writeIntLE(header, 40, (int) dataSize);

        output.write(header);
    }

    private void writeAscii(byte[] target, int offset, String value) {
        for (int i = 0; i < value.length(); i += 1) {
            target[offset + i] = (byte) value.charAt(i);
        }
    }

    private void writeIntLE(byte[] target, int offset, int value) {
        target[offset] = (byte) (value & 0xff);
        target[offset + 1] = (byte) ((value >> 8) & 0xff);
        target[offset + 2] = (byte) ((value >> 16) & 0xff);
        target[offset + 3] = (byte) ((value >> 24) & 0xff);
    }

    private void writeShortLE(byte[] target, int offset, int value) {
        target[offset] = (byte) (value & 0xff);
        target[offset + 1] = (byte) ((value >> 8) & 0xff);
    }

    private String getDisplayName(Uri uri, String fallback) {
        ContentResolver resolver = getContext().getContentResolver();

        try (Cursor cursor = resolver.query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);

                if (index >= 0) {
                    String displayName = cursor.getString(index);
                    if (displayName != null && displayName.trim().length() > 0) {
                        return displayName;
                    }
                }
            }
        }

        return fallback;
    }

    private String sanitizeFileName(String fileName) {
        return fileName.replaceAll("[^A-Za-z0-9._-]", "_");
    }
}
