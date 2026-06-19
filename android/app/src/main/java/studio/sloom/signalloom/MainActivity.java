package studio.sloom.signalloom;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Flipped true once the web app has rendered its first frame (or the safety timeout fires). */
    private volatile boolean contentReady = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must be installed before super.onCreate(). The returned controller lets us hold the
        // native splash on screen for the whole cold start instead of flashing to a blank webview.
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        registerPlugin(SignalLoomImageUpscalerPlugin.class);
        registerPlugin(SignalLoomSystemUiPlugin.class);
        registerPlugin(SignalLoomLanServerPlugin.class);
        super.onCreate(savedInstanceState);

        // Keep the native splash up until the web app reports its first paint (AndroidSplash.onWebReady).
        splashScreen.setKeepOnScreenCondition(() -> !contentReady);

        // Web -> native bridge so the page can release the splash exactly when its UI is up.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(new SplashBridge(), "AndroidSplash");
        }

        // Safety net: never hold the splash longer than 12s even if the web signal never arrives.
        new Handler(Looper.getMainLooper()).postDelayed(() -> contentReady = true, 12000L);
    }

    /** Exposed to the WebView as `window.AndroidSplash`. */
    private class SplashBridge {
        @JavascriptInterface
        public void onWebReady() {
            contentReady = true;
        }
    }
}
