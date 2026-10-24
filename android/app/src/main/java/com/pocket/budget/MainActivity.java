package com.pocket.budget;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.content.Intent;
import android.content.pm.ApplicationInfo;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        pairForUsbDebugging(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        pairForUsbDebugging(intent);
    }

    private void pairForUsbDebugging(Intent intent) {
        // Only the debug build accepts a pairing code from the local ADB runner.
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0) return;
        String token = intent.getStringExtra("pocketPairToken");
        if (token == null || !token.matches("[a-f0-9]{48}")) return;
        intent.removeExtra("pocketPairToken");
        bridge.getWebView().post(() -> bridge.getWebView().loadUrl("http://localhost:3002/pair/" + token));
    }
}
