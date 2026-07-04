package studio.sloom.signalloom;

import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.InputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import fi.iki.elonen.NanoHTTPD;

/**
 * Serves the bundled web app over the local network so a desktop browser can open the full Signal
 * Loom interface from the phone (the "phone as host" half of the phone-as-drawing-tablet vision).
 * The web layer starts this on boot (Android only) and surfaces the URL + pairing PIN.
 *
 * <p>The data API is served over plain HTTP and secured by a pairing PIN → bearer token (see
 * {@link LanAppServer}); HTTPS was dropped because a self-signed cert only produced browser warnings
 * and never provided access control. The PIN is generated here so it can be shown on the phone.
 */
@CapacitorPlugin(name = "SignalLoomLanServer")
public class SignalLoomLanServerPlugin extends Plugin {

    private static final int DEFAULT_PORT = 8723;
    // Relayed long-poll (source-library events) holds up to ~25s on the JS side; allow generous time.
    private static final int RELAY_TIMEOUT_SECONDS = 40;

    private LanAppServer server;
    private int activePort = 0;
    private String activePin = "";

    private final ConcurrentHashMap<String, CountDownLatch> pendingRequests = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> responses = new ConcurrentHashMap<>();

    @PluginMethod
    public void start(PluginCall call) {
        final int port = call.getInt("port", DEFAULT_PORT);
        // An explicit fixed PIN is optional; otherwise mint a fresh 6-digit code each server session.
        final String fixedPin = call.getString("pin", "");
        final String pin = (fixedPin != null && !fixedPin.trim().isEmpty())
            ? fixedPin.trim()
            : String.format("%06d", new SecureRandom().nextInt(1_000_000));
        try {
            if (server != null) {
                server.stop();
                server = null;
            }
            final LanAppServer next = new LanAppServer(getContext(), port, pin);

            next.setProxyHandler(session -> {
                String id = UUID.randomUUID().toString();
                JSObject req = new JSObject();
                req.put("id", id);
                req.put("method", session.getMethod().name());
                // NanoHTTPD's getUri() strips the query string. The web handler parses cursor and
                // baton-actor parameters out of req.path (`?since=`, `?device=`) — without the query,
                // every served-client op was rejected as `edit-locked` and long-polls re-sent the
                // whole event log (docs/notes/821).
                String query = session.getQueryParameterString();
                req.put("path", query != null && !query.isEmpty()
                    ? session.getUri() + "?" + query
                    : session.getUri());
                try {
                    Map<String, String> headers = session.getHeaders();
                    String contentLengthStr = headers.get("content-length");
                    if (contentLengthStr != null) {
                        int contentLength = Integer.parseInt(contentLengthStr);
                        if (contentLength > 0) {
                            byte[] buffer = new byte[contentLength];
                            InputStream is = session.getInputStream();
                            int read = 0;
                            while (read < contentLength) {
                                int r = is.read(buffer, read, contentLength - read);
                                if (r == -1) break;
                                read += r;
                            }
                            req.put("body", new String(buffer, "UTF-8"));
                        }
                    }
                } catch (Exception ignored) { }

                CountDownLatch latch = new CountDownLatch(1);
                pendingRequests.put(id, latch);
                notifyListeners("lanRequest", req);

                try {
                    latch.await(RELAY_TIMEOUT_SECONDS, TimeUnit.SECONDS);
                } catch (InterruptedException ignored) { }

                String resData = responses.remove(id);
                pendingRequests.remove(id);

                // CORS for these responses is applied by LanAppServer.serveApi after this returns.
                if (resData != null) {
                    return NanoHTTPD.newFixedLengthResponse(
                        NanoHTTPD.Response.Status.OK, "application/json", resData);
                }
                return NanoHTTPD.newFixedLengthResponse(
                    NanoHTTPD.Response.Status.INTERNAL_ERROR, NanoHTTPD.MIME_PLAINTEXT, "Timeout or error");
            });

            next.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false);
            server = next;
            activePort = port;
            activePin = pin;

            // Keep the whole process (server socket + the WebView that answers relayed data-API
            // calls) alive while the app is backgrounded or the screen is off — without this,
            // Android freezes us minutes after HOME and served browsers see connection-refused
            // mid-session (docs/notes/822).
            startKeepAliveService();

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
        activePin = "";
        stopKeepAliveService();
        call.resolve(state(false));
    }

    private void startKeepAliveService() {
        try {
            Context context = getContext();
            Intent intent = new Intent(context, LanServerForegroundService.class);
            intent.putExtra(LanServerForegroundService.EXTRA_URL, "http://" + getLanIpAddress() + ":" + activePort + "/");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception error) {
            // Serving still works in the foreground without the keep-alive; never fail start() on it.
        }
    }

    private void stopKeepAliveService() {
        try {
            Context context = getContext();
            context.stopService(new Intent(context, LanServerForegroundService.class));
        } catch (Exception ignored) {
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(state(server != null && server.isAlive()));
    }

    @PluginMethod
    public void respond(PluginCall call) {
        String id = call.getString("id");
        String data = call.getString("data");
        if (id != null) {
            responses.put(id, data != null ? data : "null");
            CountDownLatch latch = pendingRequests.get(id);
            if (latch != null) {
                latch.countDown();
            }
        }
        call.resolve();
    }

    private JSObject state(boolean running) {
        final String ip = getLanIpAddress();
        final JSObject result = new JSObject();
        result.put("running", running);
        result.put("port", running ? activePort : 0);
        result.put("ip", ip);
        result.put("pin", running ? activePin : "");
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
