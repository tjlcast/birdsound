package com.example.bird_sound;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.example.bird_sound.localmodels.LocalModelPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalModelPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        WebView webView = getBridge().getWebView();
        WebSettings webSettings = webView.getSettings();
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        // http调用
        webSettings.setMixedContentMode(webSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    }
}
