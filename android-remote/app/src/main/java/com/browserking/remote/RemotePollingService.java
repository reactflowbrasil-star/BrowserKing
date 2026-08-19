package com.browserking.remote;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.IBinder;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class RemotePollingService extends Service {
    private static final String CONNECTION_CHANNEL = "hatclaw_connection";
    private static final String RESPONSE_CHANNEL = "hatclaw_responses";
    private static final int CONNECTION_NOTIFICATION = 2001;
    private static final int RESPONSE_NOTIFICATION = 2002;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean running;
    private String baseUrl;
    private String token;
    private long cursor;
    private int lastTextHash;
    private long lastHealthCheck;
    private static final long HEALTH_CHECK_INTERVAL = 30000;

    @Override public void onCreate() {
        super.onCreate();
        createChannels();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences prefs = getSharedPreferences("remote", MODE_PRIVATE);
        baseUrl = prefs.getString("url", "").replaceAll("/+$", "");
        token = prefs.getString("token", "");
        cursor = prefs.getLong("service_cursor", 0);
        startForeground(CONNECTION_NOTIFICATION, connectionNotification("Conectado à extensão remota"));
        if (!running && !baseUrl.isEmpty() && !token.isEmpty()) {
            running = true;
            worker.execute(this::pollLoop);
        }
        return START_STICKY;
    }

    private void pollLoop() {
        while (running) {
            try {
                long now = System.currentTimeMillis();
                if (now - lastHealthCheck > HEALTH_CHECK_INTERVAL) {
                    lastHealthCheck = now;
                    JSONObject health = request("/health");
                    if (!health.optBoolean("extensionOnline", false)) {
                        updateNotification("Extensão offline — aguardando reconexão");
                        try { Thread.sleep(5000); } catch (InterruptedException error) { Thread.currentThread().interrupt(); break; }
                        continue;
                    }
                }
                JSONObject payload = request("/android/events?since=" + cursor);
                JSONArray items = payload.optJSONArray("items");
                if (items == null) continue;
                for (int index = 0; index < items.length(); index++) {
                    JSONObject item = items.getJSONObject(index);
                    cursor = Math.max(cursor, item.optLong("id"));
                    getSharedPreferences("remote", MODE_PRIVATE).edit().putLong("service_cursor", cursor).apply();
                    String type = item.optString("type");
                    if ("tabs_snapshot".equals(type)) continue;
                    if ("image".equals(type)) {
                        JSONArray images = item.optJSONArray("images");
                        String caption = item.optString("caption", "Imagem gerada pelo HatClaw");
                        if (images != null && images.length() > 0) {
                            showImageNotification(images, caption);
                        }
                        continue;
                    }
                    if ("file".equals(type)) {
                        JSONArray files = item.optJSONArray("files");
                        String caption = item.optString("caption", "Arquivo gerado pelo HatClaw");
                        if (files != null && files.length() > 0) {
                            saveFileFromEvent(files, caption);
                        }
                        continue;
                    }
                    String text = type.equals("error")
                        ? "Erro na extensão: " + item.optString("message")
                        : item.optString("text");
                    if (!text.isEmpty() && text.hashCode() != lastTextHash) {
                        lastTextHash = text.hashCode();
                        showResponse(text);
                    }
                }
            } catch (Exception ignored) {
                try { Thread.sleep(2500); } catch (InterruptedException error) { Thread.currentThread().interrupt(); break; }
            }
        }
    }

    private JSONObject request(String path) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + path).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(32000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Authorization", "Bearer " + token);
        int code = connection.getResponseCode();
        InputStream stream = code >= 400 ? connection.getErrorStream() : connection.getInputStream();
        StringBuilder content = new StringBuilder();
        if (stream != null) try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line; while ((line = reader.readLine()) != null) content.append(line);
        }
        connection.disconnect();
        if (code >= 400) throw new Exception("Relay " + code);
        return new JSONObject(content.toString());
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CONNECTION_CHANNEL, "Conexão HatClaw", NotificationManager.IMPORTANCE_LOW));
        manager.createNotificationChannel(new NotificationChannel(RESPONSE_CHANNEL, "Respostas HatClaw", NotificationManager.IMPORTANCE_DEFAULT));
    }

    private PendingIntent openAppIntent() {
        Intent intent = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification connectionNotification(String text) {
        return new Notification.Builder(this, CONNECTION_CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("HatClaw ativo")
            .setContentText(text)
            .setContentIntent(openAppIntent())
            .setOngoing(true)
            .build();
    }

    private void updateNotification(String text) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.notify(CONNECTION_NOTIFICATION, connectionNotification(text));
    }

    private void showResponse(String fullText) {
        String text = fullText.length() > 900 ? fullText.substring(fullText.length() - 900) : fullText;
        Notification notification = new Notification.Builder(this, RESPONSE_CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle("Nova resposta do HatClaw")
            .setContentText(text.replace('\n', ' '))
            .setStyle(new Notification.BigTextStyle().bigText(text))
            .setContentIntent(openAppIntent())
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .build();
        getSystemService(NotificationManager.class).notify(RESPONSE_NOTIFICATION, notification);
    }

    private void showImageNotification(JSONArray images, String caption) {
        try {
            JSONObject imageObj = images.optJSONObject(0);
            if (imageObj == null) return;
            String base64Data = imageObj.optString("base64Data", "");
            if (base64Data.isEmpty()) return;
            byte[] decoded = Base64.decode(base64Data, Base64.NO_WRAP);
            Bitmap bitmap = BitmapFactory.decodeByteArray(decoded, 0, decoded.length);
            if (bitmap == null) return;
            Notification notification = new Notification.Builder(this, RESPONSE_CHANNEL)
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentTitle("HatClaw — Imagem")
                .setContentText(caption)
                .setStyle(new Notification.BigPictureStyle().bigPicture(bitmap))
                .setContentIntent(openAppIntent())
                .setAutoCancel(true)
                .build();
            getSystemService(NotificationManager.class).notify(RESPONSE_NOTIFICATION + 1, notification);
        } catch (Exception e) {
            Log.w("HatClaw", "Failed to show image notification", e);
        }
    }

    private void saveFileFromEvent(JSONArray files, String caption) {
        try {
            JSONObject fileObj = files.optJSONObject(0);
            if (fileObj == null) return;
            String base64Data = fileObj.optString("base64Data", "");
            String fileName = fileObj.optString("fileName", "hatclaw-file");
            if (base64Data.isEmpty()) return;
            byte[] decoded = Base64.decode(base64Data, Base64.NO_WRAP);
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/octet-stream");
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri != null) {
                    try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                        if (out != null) out.write(decoded);
                    }
                    showResponse(caption + " — " + fileName + " salvo em Downloads");
                }
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File file = new File(dir, fileName);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(decoded);
                }
                showResponse(caption + " — " + file.getAbsolutePath());
            }
        } catch (Exception e) {
            Log.w("HatClaw", "Failed to save file from event", e);
        }
    }

    @Override public void onDestroy() {
        running = false;
        worker.shutdownNow();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
