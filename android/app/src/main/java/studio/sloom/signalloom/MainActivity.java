package studio.sloom.signalloom;

import android.os.Bundle;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(SignalLoomImageUpscalerPlugin.class);
        registerPlugin(SignalLoomSystemUiPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
