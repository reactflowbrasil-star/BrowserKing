package com.browserking.remote;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.ActivityNotFoundException;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.text.InputType;
import android.util.Base64;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.ArrayList;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String PERMANENT_SERVER = "https://hatclaw.com/extencao";
    private EditText serverUrl;
    private EditText pairingToken;
    private EditText promptInput;
    private TextView statusText;
    private TextView connectionDot;
    private TextView emptyState;
    private LinearLayout connectionPanel;
    private LinearLayout messageList;
    private ScrollView messageScroll;
    private Button sendButton;
    private final ExecutorService network = Executors.newCachedThreadPool();
    private volatile boolean polling;
    private volatile long eventCursor;
    private String baseUrl = "";
    private String token = "";
    private MessageBubble pendingAssistant;
    private TextView toolsCapability;
    private TextView skillsCapability;
    private TextView pluginsCapability;
    private TextView appsCapability;
    private TextView providersCapability;
    private LinearLayout tabList;
    private TextView approvalMode;
    private TextView attachButton;
    private TextView exportButton;
    private TextView micButton;
    private TextView streamingIndicator;
    private LinearLayout graphSection;
    private TextView graphStatus;
    private Button graphSyncButton;
    private SpeechRecognizer speechRecognizer;
    private boolean listening;
    private final ArrayList<JSONObject> pendingAttachments = new ArrayList<>();
    private String approvalModeValue = "auto";
    private String deviceId;
    private static final int PICK_IMAGE = 4101;
    private static final int REQUEST_AUDIO = 4102;
    private static final int REQUEST_IMAGES = 4103;
    private static final int EXPORT_CONVERSATION = 4104;
    private String pendingExportContent;
    private String pendingExportMime;
    private String pendingExportName;

    private static final class MessageBubble {
        final LinearLayout root;
        final TextView summary;
        final TextView details;
        final TextView toggle;
        final LinearLayout mediaContainer;
        boolean expanded;

        MessageBubble(LinearLayout root, TextView summary, TextView details, TextView toggle, LinearLayout mediaContainer) {
            this.root = root;
            this.summary = summary;
            this.details = details;
            this.toggle = toggle;
            this.mediaContainer = mediaContainer;
        }
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);

        serverUrl = findViewById(R.id.serverUrl);
        pairingToken = findViewById(R.id.pairingToken);
        promptInput = findViewById(R.id.promptInput);
        statusText = findViewById(R.id.statusText);
        connectionDot = findViewById(R.id.connectionDot);
        emptyState = findViewById(R.id.emptyState);
        connectionPanel = findViewById(R.id.connectionPanel);
        messageList = findViewById(R.id.messageList);
        messageScroll = findViewById(R.id.messageScroll);
        sendButton = findViewById(R.id.sendButton);
        toolsCapability = findViewById(R.id.toolsCapability);
        skillsCapability = findViewById(R.id.skillsCapability);
        pluginsCapability = findViewById(R.id.pluginsCapability);
        appsCapability = findViewById(R.id.appsCapability);
        providersCapability = findViewById(R.id.providersCapability);
        tabList = findViewById(R.id.tabList);
        approvalMode = findViewById(R.id.approvalMode);
        attachButton = findViewById(R.id.attachButton);
        exportButton = findViewById(R.id.exportButton);
        micButton = findViewById(R.id.micButton);
        streamingIndicator = findViewById(R.id.streamingIndicator);
        graphSection = findViewById(R.id.graphSection);
        graphStatus = findViewById(R.id.graphStatus);
        graphSyncButton = findViewById(R.id.graphSyncButton);

        deviceId = getOrCreateDeviceId();
        setCapabilities(null, false);

        SharedPreferences prefs = getSharedPreferences("remote", MODE_PRIVATE);
        String savedUrl = prefs.getString("url", "");
        if (savedUrl.isEmpty() || savedUrl.contains(".trycloudflare.com")) savedUrl = PERMANENT_SERVER;
        serverUrl.setText(savedUrl);
        pairingToken.setText(prefs.getString("token", ""));
        approvalModeValue = prefs.getString("approval_mode", "auto");
        approvalMode.setText("auto".equals(approvalModeValue) ? "⚡  Agir sem perguntar  ⌄" : "☝  Perguntar antes de agir  ⌄");

        findViewById(R.id.moreButton).setOnClickListener(v -> toggleConnectionPanel());
        findViewById(R.id.connectButton).setOnClickListener(v -> connect(false));
        sendButton.setOnClickListener(v -> sendPrompt());
        approvalMode.setOnClickListener(v -> toggleApprovalMode());
        attachButton.setOnClickListener(v -> chooseImage());
        exportButton.setOnClickListener(v -> showExportMenu());
        micButton.setOnClickListener(v -> toggleMicrophone());
        graphSyncButton.setOnClickListener(v -> syncGraph());
        promptInput.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                sendPrompt();
                return true;
            }
            return false;
        });

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
        }

        if (!pairingToken.getText().toString().trim().isEmpty()) connect(true);
        else {
            connectionPanel.setVisibility(View.VISIBLE);
            setConnectionState("Configure o pareamento", false);
        }
    }

    private void showExportMenu() {
        new android.app.AlertDialog.Builder(this)
            .setTitle("Exportar histórico da conversa")
            .setItems(new String[]{"Exportar como TXT", "Exportar como Markdown"}, (dialog, which) -> beginExport(which == 1 ? "md" : "txt"))
            .show();
    }

    private String collectConversationText() {
        StringBuilder output = new StringBuilder("HatClaw — Histórico da conversa\nExportado em ")
            .append(new java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault()).format(new java.util.Date())).append("\n\n");
        for (int i = 0; i < messageList.getChildCount(); i++) {
            View child = messageList.getChildAt(i);
            String text = child instanceof TextView ? ((TextView) child).getText().toString().trim() : child.toString();
            if (!text.isEmpty()) output.append(text).append("\n\n");
        }
        return output.toString().trim() + "\n";
    }

    private void beginExport(String format) {
        pendingExportContent = collectConversationText();
        pendingExportMime = "md".equals(format) ? "text/markdown" : "text/plain";
        pendingExportName = "hatclaw-conversa-" + new java.text.SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new java.util.Date()) + ("md".equals(format) ? ".md" : ".txt");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.setType(pendingExportMime);
        intent.putExtra(Intent.EXTRA_TITLE, pendingExportName);
        startActivityForResult(intent, EXPORT_CONVERSATION);
    }

    private String getOrCreateDeviceId() {
        SharedPreferences prefs = getSharedPreferences("remote", MODE_PRIVATE);
        String id = prefs.getString("device_id", "");
        if (id.isEmpty()) {
            id = "android-" + UUID.randomUUID().toString().substring(0, 8);
            prefs.edit().putString("device_id", id).apply();
        }
        return id;
    }

    private void toggleConnectionPanel() {
        connectionPanel.setVisibility(connectionPanel.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE);
    }

    private void connect(boolean automatic) {
        baseUrl = serverUrl.getText().toString().trim().replaceAll("/+$", "");
        token = pairingToken.getText().toString().trim();
        if (baseUrl.isEmpty() || token.isEmpty()) {
            connectionPanel.setVisibility(View.VISIBLE);
            setConnectionState("Informe o endereço e o token", false);
            return;
        }
        setConnectionState("Conectando…", false);
        network.execute(() -> {
            try {
                JSONObject remote = request("GET", "/android/status", null, true);
                if (!remote.optBoolean("extensionOnline")) throw new Exception("Extensão remota offline");
                eventCursor = remote.optLong("eventCursor", eventCursor);
                JSONObject capabilities = remote.optJSONObject("capabilities");
                JSONArray tabs = remote.optJSONArray("tabs");
                getSharedPreferences("remote", MODE_PRIVATE).edit()
                    .putString("url", baseUrl)
                    .putString("token", token)
                    .putLong("service_cursor", eventCursor)
                    .apply();
                Intent service = new Intent(this, RemotePollingService.class);
                if (Build.VERSION.SDK_INT >= 26) startForegroundService(service); else startService(service);
                runOnUiThread(() -> {
                    setConnectionState("Extensão conectada", true);
                    setCapabilities(capabilities, true);
                    renderTabs(tabs);
                    sendButton.setEnabled(true);
                    if (!automatic) connectionPanel.setVisibility(View.GONE);
                });
                if (!polling) {
                    polling = true;
                    network.execute(this::pollEvents);
                }
                loadGraphStatus();
            } catch (Exception error) {
                runOnUiThread(() -> {
                    setConnectionState(error.getMessage(), false);
                    setCapabilities(null, false);
                    sendButton.setEnabled(false);
                    connectionPanel.setVisibility(View.VISIBLE);
                });
            }
        });
    }

    private void sendPrompt() {
        String text = promptInput.getText().toString().trim();
        if (text.isEmpty() || !sendButton.isEnabled()) return;
        addMessage(text, true);
        promptInput.setText("");
        sendButton.setEnabled(false);
        pendingAssistant = addMessage("Pensando…", false);
        showStreamingIndicator(true);
        network.execute(() -> {
            try {
                JSONObject payload = new JSONObject().put("text", text).put("approvalMode", approvalModeValue);
                if (!pendingAttachments.isEmpty()) {
                    JSONArray attachments = new JSONArray();
                    synchronized (pendingAttachments) { for (JSONObject item : pendingAttachments) attachments.put(item); pendingAttachments.clear(); }
                    payload.put("attachments", attachments);
                }
                request("POST", "/android/command", payload, true);
                runOnUiThread(() -> sendButton.setEnabled(true));
            } catch (Exception error) {
                runOnUiThread(() -> {
                    renderAssistantText("Não foi possível enviar: " + error.getMessage());
                    sendButton.setEnabled(true);
                    showStreamingIndicator(false);
                });
            }
        });
    }

    private void toggleApprovalMode() {
        if ("ask".equals(approvalModeValue)) {
            approvalModeValue = "auto";
            getSharedPreferences("remote", MODE_PRIVATE).edit().putString("approval_mode", approvalModeValue).apply();
            approvalMode.setText("⚡  Agir sem perguntar  ⌄");
            Toast.makeText(this, "Modo: agir sem perguntar", Toast.LENGTH_SHORT).show();
        } else {
            approvalModeValue = "ask";
            getSharedPreferences("remote", MODE_PRIVATE).edit().putString("approval_mode", approvalModeValue).apply();
            approvalMode.setText("☝  Perguntar antes de agir  ⌄");
            Toast.makeText(this, "Modo: perguntar antes de agir", Toast.LENGTH_SHORT).show();
        }
    }

    private void chooseImage() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.READ_MEDIA_IMAGES}, REQUEST_IMAGES);
            return;
        }
        if (Build.VERSION.SDK_INT < 33 && checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE}, REQUEST_IMAGES);
            return;
        }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.setType("image/*"); intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false); intent.addCategory(Intent.CATEGORY_OPENABLE);
        try { startActivityForResult(intent, PICK_IMAGE); } catch (ActivityNotFoundException error) { Toast.makeText(this, "Seletor de imagens indisponível", Toast.LENGTH_LONG).show(); }
    }

    private void toggleMicrophone() {
        if (listening) { if (speechRecognizer != null) speechRecognizer.stopListening(); return; }
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_AUDIO); return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) { Toast.makeText(this, "Reconhecimento de voz indisponível neste dispositivo", Toast.LENGTH_LONG).show(); return; }
        if (speechRecognizer == null) speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            public void onReadyForSpeech(Bundle p) { listening = true; micButton.setTextColor(getColor(R.color.success)); micButton.setContentDescription("Parar microfone"); Toast.makeText(MainActivity.this, "Ouvindo…", Toast.LENGTH_SHORT).show(); }
            public void onResults(Bundle b) { ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); if (r != null && !r.isEmpty()) promptInput.setText(r.get(0)); resetMic(); }
            public void onError(int e) { resetMic(); Toast.makeText(MainActivity.this, "Falha no microfone (" + e + ")", Toast.LENGTH_SHORT).show(); }
            public void onEndOfSpeech() { resetMic(); }
            public void onBeginningOfSpeech() {} public void onRmsChanged(float v) {} public void onBufferReceived(byte[] b) {} public void onPartialResults(Bundle b) {} public void onEvent(int t, Bundle b) {}
        });
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM).putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault()).putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        speechRecognizer.startListening(intent);
    }

    private void resetMic() { listening = false; runOnUiThread(() -> { micButton.setTextColor(getColor(R.color.send_blue)); micButton.setContentDescription("Microfone"); }); }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == EXPORT_CONVERSATION) {
            if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
            try (OutputStream stream = getContentResolver().openOutputStream(data.getData())) {
                stream.write(pendingExportContent.getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this, "Histórico exportado", Toast.LENGTH_SHORT).show();
            } catch (Exception error) {
                Toast.makeText(this, "Falha ao exportar: " + error.getMessage(), Toast.LENGTH_LONG).show();
            }
            return;
        }
        if (requestCode != PICK_IMAGE || resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        try (InputStream input = getContentResolver().openInputStream(uri); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (input == null) throw new Exception("arquivo não acessível");
            byte[] buffer = new byte[8192]; int n; int total = 0;
            while ((n = input.read(buffer)) != -1) { total += n; if (total > 160000) throw new Exception("imagem excede 160 KB"); out.write(buffer, 0, n); }
            String mime = getContentResolver().getType(uri); if (mime == null || !mime.startsWith("image/")) throw new Exception("selecione uma imagem");
            String name = "android-image.jpg"; Cursor c = getContentResolver().query(uri, null, null, null, null); if (c != null) { try { int ix = c.getColumnIndex(OpenableColumns.DISPLAY_NAME); if (ix >= 0 && c.moveToFirst()) name = c.getString(ix); } finally { c.close(); } }
            JSONObject item = new JSONObject().put("fileName", name).put("mimeType", mime).put("base64Data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)).put("bytes", total);
            synchronized (pendingAttachments) { pendingAttachments.clear(); pendingAttachments.add(item); }
            attachButton.setText("✓"); attachButton.setContentDescription("Imagem anexada"); Toast.makeText(this, "Imagem anexada ao próximo comando", Toast.LENGTH_SHORT).show();
        } catch (Exception error) { Toast.makeText(this, "Não foi possível anexar: " + error.getMessage(), Toast.LENGTH_LONG).show(); }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (grantResults.length == 0 || grantResults[0] != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "Permissão necessária não concedida", Toast.LENGTH_LONG).show();
            return;
        }
        if (requestCode == REQUEST_AUDIO) toggleMicrophone();
        else if (requestCode == REQUEST_IMAGES) chooseImage();
    }

    private void pollEvents() {
        while (polling) {
            try {
                JSONObject payload = request("GET", "/android/events?since=" + eventCursor, null, true);
                JSONArray items = payload.optJSONArray("items");
                if (items == null) continue;
                for (int i = 0; i < items.length(); i++) {
                    JSONObject item = items.getJSONObject(i);
                    eventCursor = Math.max(eventCursor, item.optLong("id"));
                    String type = item.optString("type");
                    if ("tabs_snapshot".equals(type)) {
                        runOnUiThread(() -> renderTabs(item.optJSONArray("tabs")));
                        continue;
                    }
                    if ("image".equals(type)) {
                        JSONArray images = item.optJSONArray("images");
                        String caption = item.optString("caption", "Imagem gerada pelo HatClaw");
                        if (images != null && images.length() > 0) {
                            runOnUiThread(() -> renderImageEvent(images, caption));
                        }
                        continue;
                    }
                    if ("file".equals(type)) {
                        JSONArray files = item.optJSONArray("files");
                        String caption = item.optString("caption", "Arquivo gerado pelo HatClaw");
                        if (files != null && files.length() > 0) {
                            runOnUiThread(() -> renderFileEvent(files, caption));
                        }
                        continue;
                    }
                    if ("assistant_message".equals(type)) {
                        String status = item.optString("status", "");
                        String text = item.optString("text", "");
                        if ("streaming".equals(status)) {
                            runOnUiThread(() -> showStreamingIndicator(true));
                        } else {
                            runOnUiThread(() -> showStreamingIndicator(false));
                        }
                        if (!text.isEmpty()) runOnUiThread(() -> renderAssistantText(text));
                        continue;
                    }
                    String text = type.equals("error")
                        ? "Erro na extensão: " + item.optString("message")
                        : item.optString("text");
                    if (!text.isEmpty()) runOnUiThread(() -> renderAssistantText(text));
                }
                getSharedPreferences("remote", MODE_PRIVATE).edit().putLong("service_cursor", eventCursor).apply();
            } catch (Exception error) {
                runOnUiThread(() -> setConnectionState("Reconectando…", false));
                try { Thread.sleep(1800); } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    private void renderImageEvent(JSONArray images, String caption) {
        for (int i = 0; i < images.length(); i++) {
            JSONObject imageObj = images.optJSONObject(i);
            if (imageObj == null) continue;
            String base64Data = imageObj.optString("base64Data", "");
            if (base64Data.isEmpty()) continue;
            try {
                byte[] decoded = Base64.decode(base64Data, Base64.NO_WRAP);
                Bitmap bitmap = BitmapFactory.decodeByteArray(decoded, 0, decoded.length);
                if (bitmap == null) continue;
                MessageBubble bubble = addMessage(caption, false);
                if (bubble.mediaContainer != null) {
                    ImageView imageView = new ImageView(this);
                    imageView.setImageBitmap(bitmap);
                    imageView.setAdjustViewBounds(true);
                    imageView.setMaxWidth(dp(280));
                    imageView.setMaxHeight(dp(400));
                    imageView.setPadding(0, dp(8), 0, 0);
                    LinearLayout.LayoutParams imgParams = new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                    imgParams.gravity = Gravity.START;
                    bubble.mediaContainer.addView(imageView, imgParams);
                    bubble.mediaContainer.setVisibility(View.VISIBLE);
                }
            } catch (Exception e) {
                Log.w("HatClaw", "Failed to decode image", e);
            }
        }
    }

    private void renderFileEvent(JSONArray files, String caption) {
        for (int i = 0; i < files.length(); i++) {
            JSONObject fileObj = files.optJSONObject(i);
            if (fileObj == null) continue;
            String fileName = fileObj.optString("fileName", "arquivo");
            String mimeType = fileObj.optString("mimeType", "application/octet-stream");
            String base64Data = fileObj.optString("base64Data", "");
            if (base64Data.isEmpty()) continue;
            MessageBubble bubble = addMessage(caption + "\n📄 " + fileName, false);
            if (bubble.mediaContainer != null) {
                TextView downloadBtn = new TextView(this);
                downloadBtn.setText("⬇ Baixar " + fileName);
                downloadBtn.setTextColor(getColor(R.color.send_blue));
                downloadBtn.setTextSize(13);
                downloadBtn.setPadding(dp(8), dp(6), dp(8), dp(6));
                downloadBtn.setBackgroundResource(R.drawable.connect_bg);
                LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                btnParams.gravity = Gravity.START;
                final String data = base64Data;
                final String name = fileName;
                final String mime = mimeType;
                downloadBtn.setOnClickListener(v -> downloadFile(data, name, mime));
                bubble.mediaContainer.addView(downloadBtn, btnParams);
                bubble.mediaContainer.setVisibility(View.VISIBLE);
            }
        }
    }

    private void downloadFile(String base64Data, String fileName, String mimeType) {
        try {
            byte[] decoded = Base64.decode(base64Data, Base64.NO_WRAP);
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri != null) {
                    try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                        if (out != null) out.write(decoded);
                    }
                    Toast.makeText(this, "Salvo: " + fileName, Toast.LENGTH_SHORT).show();
                }
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File file = new File(dir, fileName);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(decoded);
                }
                Toast.makeText(this, "Salvo: " + file.getAbsolutePath(), Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            Toast.makeText(this, "Falha ao salvar: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void renderTabs(JSONArray tabs) {
        if (tabList == null) return;
        tabList.removeAllViews();
        if (tabs == null || tabs.length() == 0) {
            TextView empty = tabChip("Nenhuma aba detectada", false);
            tabList.addView(empty);
            return;
        }
        for (int i = 0; i < tabs.length(); i++) {
            JSONObject tab = tabs.optJSONObject(i);
            if (tab == null) continue;
            String title = tab.optString("title", "Sem título").trim();
            String url = tab.optString("url", "");
            boolean active = tab.optBoolean("active", false);
            String host = url;
            try { host = new java.net.URL(url).getHost(); } catch (Exception ignored) {}
            String label = (active ? "● " : "○ ") + (title.isEmpty() ? host : title);
            TextView chip = tabChip(label, active);
            final int tabId = tab.optInt("id", -1);
            chip.setOnClickListener(v -> activateTab(tabId));
            chip.setContentDescription((active ? "Aba ativa: " : "Aba: ") + title + (host.isEmpty() ? "" : " — " + host));
            tabList.addView(chip);
        }
    }

    private TextView tabChip(String label, boolean active) {
        TextView chip = new TextView(this);
        chip.setText(label);
        chip.setTextColor(getColor(active ? R.color.text_primary : R.color.text_secondary));
        chip.setTextSize(12);
        chip.setGravity(Gravity.CENTER_VERTICAL);
        chip.setMaxLines(1);
        chip.setEllipsize(android.text.TextUtils.TruncateAt.END);
        chip.setPadding(dp(12), 0, dp(12), 0);
        chip.setBackgroundResource(active ? R.drawable.connect_bg : R.drawable.field_bg);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(230), dp(36));
        params.setMargins(0, 0, dp(8), 0);
        chip.setLayoutParams(params);
        return chip;
    }

    private void activateTab(int tabId) {
        if (tabId < 0 || baseUrl.isEmpty() || token.isEmpty()) return;
        network.execute(() -> {
            try {
                request("POST", "/android/tab/activate", new JSONObject().put("tabId", tabId), true);
            } catch (Exception error) {
                runOnUiThread(() -> Toast.makeText(this, "Não foi possível ativar a aba: " + error.getMessage(), Toast.LENGTH_LONG).show());
            }
        });
    }

    private MessageBubble addMessage(String text, boolean user) {
        emptyState.setVisibility(View.GONE);
        LinearLayout bubble = new LinearLayout(this);
        bubble.setOrientation(LinearLayout.VERTICAL);
        bubble.setPadding(dp(15), dp(11), dp(12), dp(11));
        bubble.setBackgroundResource(user ? R.drawable.message_user_bg : R.drawable.message_assistant_bg);

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setOrientation(LinearLayout.HORIZONTAL);
        TextView summary = new TextView(this);
        summary.setTextColor(getColor(R.color.text_primary));
        summary.setTextSize(15);
        summary.setLineSpacing(0, 1.08f);
        TextView toggle = new TextView(this);
        toggle.setText("⌄");
        toggle.setTextColor(getColor(R.color.send_blue));
        toggle.setTextSize(18);
        toggle.setGravity(Gravity.CENTER);
        toggle.setContentDescription("Expandir mensagem");
        header.addView(summary, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        header.addView(toggle, new LinearLayout.LayoutParams(dp(32), dp(32)));

        TextView details = new TextView(this);
        details.setTextColor(getColor(R.color.text_primary));
        details.setTextSize(14);
        details.setLineSpacing(0, 1.12f);
        details.setTextIsSelectable(!user);
        details.setPadding(0, dp(8), 0, 0);
        details.setVisibility(View.GONE);

        LinearLayout mediaContainer = new LinearLayout(this);
        mediaContainer.setOrientation(LinearLayout.VERTICAL);
        mediaContainer.setVisibility(View.GONE);

        bubble.addView(header);
        bubble.addView(details);
        bubble.addView(mediaContainer);

        MessageBubble message = new MessageBubble(bubble, summary, details, toggle, mediaContainer);
        updateMessage(message, text);
        View.OnClickListener expand = view -> toggleMessage(message);
        header.setOnClickListener(expand);
        toggle.setOnClickListener(expand);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            user ? dp(310) : ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.gravity = user ? Gravity.END : Gravity.START;
        params.setMargins(user ? dp(34) : 0, dp(8), user ? 0 : dp(34), dp(2));
        messageList.addView(bubble, params);
        scrollToBottom();
        return message;
    }

    private void renderAssistantText(String text) {
        if (pendingAssistant == null) pendingAssistant = addMessage(text, false);
        else updateMessage(pendingAssistant, text);
        showStreamingIndicator(false);
        scrollToBottom();
    }

    private void updateMessage(MessageBubble message, String text) {
        String safeText = text == null ? "" : text.trim();
        boolean expandable = safeText.length() > 180 || safeText.split("\\R", -1).length > 4;
        message.summary.setText(expandable ? summarize(safeText) : safeText);
        message.details.setText(safeText);
        message.toggle.setVisibility(expandable ? View.VISIBLE : View.GONE);
        if (!expandable) {
            message.expanded = false;
            message.details.setVisibility(View.GONE);
        }
    }

    private String summarize(String text) {
        String normalized = text.replaceAll("\\s+", " ").trim();
        String prefix = looksLikeToolEvent(text) ? "Ferramenta • " : "";
        int limit = 116 - prefix.length();
        if (normalized.length() > limit) normalized = normalized.substring(0, Math.max(1, limit - 1)).trim() + "…";
        return prefix + normalized;
    }

    private boolean looksLikeToolEvent(String text) {
        String value = text.toLowerCase();
        return value.contains("tool_use") || value.contains("tool_result") || value.contains("ferramenta")
            || value.contains("executando") || value.contains("conector") || value.contains("plugin");
    }

    private void toggleMessage(MessageBubble message) {
        if (message.toggle.getVisibility() != View.VISIBLE) return;
        message.expanded = !message.expanded;
        message.details.setVisibility(message.expanded ? View.VISIBLE : View.GONE);
        message.summary.setVisibility(message.expanded ? View.INVISIBLE : View.VISIBLE);
        message.toggle.setText(message.expanded ? "⌃" : "⌄");
        message.toggle.setContentDescription(message.expanded ? "Recolher mensagem" : "Expandir mensagem");
        scrollToBottom();
    }

    private void showStreamingIndicator(boolean active) {
        if (streamingIndicator != null) {
            streamingIndicator.setVisibility(active ? View.VISIBLE : View.GONE);
        }
    }

    private void setCapabilities(JSONObject capabilities, boolean extensionOnline) {
        configureCapability(toolsCapability, "Ferramentas", capability(capabilities, "tools", extensionOnline),
            "Automação do navegador, screenshots, cliques, texto e navegação.");
        configureCapability(skillsCapability, "Skills", capability(capabilities, "skills", false),
            "Skills publicadas pela extensão conectada.");
        configureCapability(pluginsCapability, "Plugins", capability(capabilities, "plugins", false),
            "Plugins disponíveis na sessão remota.");
        configureCapability(appsCapability, "Apps", capability(capabilities, "apps", false),
            "Conexões com apps e serviços externos.");
        if (capabilities != null) {
            int providersCount = capabilities.optInt("providers", 0);
            configureProvidersCapability(providersCount);
        } else {
            configureProvidersCapability(0);
        }
    }

    private boolean capability(JSONObject capabilities, String key, boolean fallback) {
        return capabilities == null ? fallback : capabilities.optBoolean(key, fallback);
    }

    private void configureCapability(TextView view, String label, boolean active, String detail) {
        if (view == null) return;
        view.setText((active ? "● " : "○ ") + label);
        view.setTextColor(getColor(active ? R.color.send_blue : R.color.text_secondary));
        view.setAlpha(active ? 1f : 0.72f);
        view.setOnClickListener(v -> Toast.makeText(this,
            label + ": " + (active ? "disponível" : "não anunciado") + "\n" + detail,
            Toast.LENGTH_LONG).show());
    }

    private void configureProvidersCapability(int count) {
        if (providersCapability == null) return;
        boolean active = count > 0;
        providersCapability.setText(active ? "● Providers (" + count + ")" : "○ Providers");
        providersCapability.setTextColor(getColor(active ? R.color.send_blue : R.color.text_secondary));
        providersCapability.setAlpha(active ? 1f : 0.72f);
        providersCapability.setOnClickListener(v -> Toast.makeText(this,
            "Providers: " + (active ? count + " ativo(s)" : "nenhum") + "\nProvedores LLM configurados na extensão.",
            Toast.LENGTH_LONG).show());
    }

    private void scrollToBottom() {
        messageScroll.post(() -> messageScroll.fullScroll(View.FOCUS_DOWN));
    }

    private void setConnectionState(String text, boolean connected) {
        statusText.setText(text == null ? "Sem conexão" : text);
        statusText.setTextColor(getColor(connected ? R.color.success : R.color.text_secondary));
        connectionDot.setTextColor(getColor(connected ? R.color.success : R.color.text_muted));
    }

    private void syncGraph() {
        if (baseUrl.isEmpty() || token.isEmpty()) {
            Toast.makeText(this, "Conecte-se primeiro", Toast.LENGTH_SHORT).show();
            return;
        }
        graphSyncButton.setEnabled(false);
        graphSyncButton.setText("…");
        network.execute(() -> {
            try {
                JSONObject state = new JSONObject();
                state.put("activeProjectId", "default");
                JSONArray projects = new JSONArray();
                projects.put(new JSONObject().put("id", "default").put("name", "HatClaw")
                    .put("createdAt", System.currentTimeMillis()).put("updatedAt", System.currentTimeMillis()));
                state.put("projects", projects);
                state.put("graphs", new JSONObject());
                JSONObject payload = new JSONObject()
                    .put("deviceId", deviceId)
                    .put("state", state);
                JSONObject response = request("POST", "/graph/sync", payload, true);
                int revision = response.optInt("revision", 0);
                JSONObject deviceState = response.optJSONObject("state");
                int deviceCount = 0;
                if (deviceState != null) {
                    JSONArray devs = deviceState.optJSONArray("devices");
                    if (devs != null) deviceCount = devs.length();
                }
                final int rev = revision;
                final int devs = deviceCount;
                runOnUiThread(() -> {
                    graphSection.setVisibility(View.VISIBLE);
                    graphStatus.setText("v" + rev + " • " + devs + " dispositivo(s)");
                    graphSyncButton.setEnabled(true);
                    graphSyncButton.setText("Sync");
                    Toast.makeText(this, "Graph sincronizado (rev " + rev + ")", Toast.LENGTH_SHORT).show();
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    graphSyncButton.setEnabled(true);
                    graphSyncButton.setText("Sync");
                    Toast.makeText(this, "Falha no sync: " + error.getMessage(), Toast.LENGTH_LONG).show();
                });
            }
        });
    }

    private void loadGraphStatus() {
        network.execute(() -> {
            try {
                JSONObject response = request("GET", "/health", null, true);
                if (response.optBoolean("ok")) {
                    runOnUiThread(() -> {
                        graphSection.setVisibility(View.VISIBLE);
                        graphStatus.setText("Online • Sync disponível");
                    });
                }
            } catch (Exception ignored) {}
        });
    }

    private JSONObject request(String method, String path, JSONObject body, boolean auth) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + path).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(7000);
        connection.setReadTimeout(path.startsWith("/android/events") ? 32000 : 10000);
        connection.setRequestProperty("Accept", "application/json");
        if (auth) connection.setRequestProperty("Authorization", "Bearer " + token);
        if (body != null) {
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
        }
        int code = connection.getResponseCode();
        InputStream stream = code >= 400 ? connection.getErrorStream() : connection.getInputStream();
        StringBuilder content = new StringBuilder();
        if (stream != null) try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line; while ((line = reader.readLine()) != null) content.append(line);
        }
        connection.disconnect();
        if (code >= 400) throw new Exception(code == 401 ? "Token inválido" : "Relay respondeu " + code);
        return new JSONObject(content.toString());
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override protected void onDestroy() {
        polling = false;
        network.shutdownNow();
        super.onDestroy();
    }
}
