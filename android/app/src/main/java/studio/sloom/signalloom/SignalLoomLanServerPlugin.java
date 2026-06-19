package studio.sloom.signalloom;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;

import fi.iki.elonen.NanoHTTPD;

/**
 * Serves the bundled web app over the local network so a desktop browser can open the full Signal
 * Loom interface from the phone (the "phone as host" half of the phone-as-drawing-tablet vision).
 * The web layer starts this on boot (Android only) and surfaces the URL.
 */
@CapacitorPlugin(name = "SignalLoomLanServer")
public class SignalLoomLanServerPlugin extends Plugin {

    private static final int DEFAULT_PORT = 8723;
    private LanAppServer server;
    private int activePort = 0;

    @PluginMethod
    public void start(PluginCall call) {
        final int port = call.getInt("port", DEFAULT_PORT);
        try {
            if (server != null) {
                server.stop();
                server = null;
            }
            final LanAppServer next = new LanAppServer(getContext(), port);
            next.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false);
            server = next;
            activePort = port;
            call.resolve(state(true));
        } catch (IOException error) {
            call.reject("Failed to start LAN server on port " + port + ": " + error.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (server != null) {
            server.stop();
            server = null;
        }
        activePort = 0;
        call.resolve(state(false));
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(state(server != null && server.isAlive()));
    }

    private JSObject state(boolean running) {
        final String ip = getLanIpAddress();
        final JSObject result = new JSObject();
        result.put("running", running);
        result.put("port", running ? activePort : 0);
        result.put("ip", ip);
        result.put("url", running ? "http://" + ip + ":" + activePort + "/" : null);
        return result;
    }

    /** First non-loopback IPv4 of an up interface — the address a LAN browser should target. */
    private String getLanIpAddress() {
        try {
            for (NetworkInterface networkInterface : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (networkInterface.isLoopback() || !networkInterface.isUp()) continue;
                for (InetAddress address : Collections.list(networkInterface.getInetAddresses())) {
                    if (address instanceof Inet4Address && !address.isLoopbackAddress()) {
                        return address.getHostAddress();
                    }
                }
            }
        } catch (Exception ignored) {
            // fall through
        }
        return "127.0.0.1";
    }
}
