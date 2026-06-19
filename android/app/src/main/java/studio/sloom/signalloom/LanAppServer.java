package studio.sloom.signalloom;

import android.content.Context;
import android.content.res.AssetManager;

import java.io.IOException;
import java.io.InputStream;

import fi.iki.elonen.NanoHTTPD;

/**
 * Tiny LAN web server that streams the bundled web app (android/app/src/main/assets/public,
 * the same Vite build the WebView loads) over HTTP, so a desktop browser on the same network can
 * open the full Signal Loom interface from the phone. Read-only static file serving from the APK
 * assets — no write surface. The served app runs in plain "web" mode (no Capacitor bridge), which
 * matches the Chrome build used for tests.
 */
public class LanAppServer extends NanoHTTPD {

    private static final String ROOT = "public";
    private final AssetManager assets;

    public LanAppServer(Context context, int port) {
        super(port);
        this.assets = context.getApplicationContext().getAssets();
    }

    @Override
    public Response serve(IHTTPSession session) {
        String path = session.getUri();
        int query = path.indexOf('?');
        if (query >= 0) path = path.substring(0, query);
        if (path.isEmpty() || path.equals("/")) path = "/index.html";

        // No path traversal out of the asset root.
        if (path.contains("..")) {
            return newFixedLengthResponse(Response.Status.FORBIDDEN, MIME_PLAINTEXT, "Forbidden");
        }

        final String assetPath = ROOT + path;
        try {
            final InputStream stream = assets.open(assetPath);
            final Response response = newChunkedResponse(Response.Status.OK, mimeFor(path), stream);
            response.addHeader("Access-Control-Allow-Origin", "*");
            response.addHeader("Cache-Control", "no-cache");
            return response;
        } catch (IOException missing) {
            // SPA fallback: serve index.html for extension-less route paths, 404 for missing assets
            // (so a missing .js never returns HTML and breaks module loading).
            final String leaf = path.substring(path.lastIndexOf('/') + 1);
            if (!leaf.contains(".")) {
                try {
                    final InputStream index = assets.open(ROOT + "/index.html");
                    final Response response = newChunkedResponse(Response.Status.OK, "text/html", index);
                    response.addHeader("Access-Control-Allow-Origin", "*");
                    return response;
                } catch (IOException ignored) {
                    // fall through to 404
                }
            }
            return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found");
        }
    }

    private static String mimeFor(String path) {
        if (path.endsWith(".html") || path.endsWith(".htm")) return "text/html";
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json") || path.endsWith(".map")) return "application/json";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".gif")) return "image/gif";
        if (path.endsWith(".webp")) return "image/webp";
        if (path.endsWith(".ico")) return "image/x-icon";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".woff")) return "font/woff";
        if (path.endsWith(".ttf")) return "font/ttf";
        if (path.endsWith(".wasm")) return "application/wasm";
        return "application/octet-stream";
    }
}
