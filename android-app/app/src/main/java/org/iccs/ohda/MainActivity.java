package org.iccs.ohda;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintManager;
import android.content.Context;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

public final class MainActivity extends Activity {
    // This is a thin, installable Android client for the Windows inventory service.
    // All approved inventory movements stay on the server; never copy the live SQLite file.
    private static final String DEFAULT_URL = "https://ohda.hksalameh.workers.dev";
    private static final String PREFS = "ohda_mobile_settings";
    private static final String PREF_SERVER = "server_url";
    private static final int FILE_REQUEST = 4001;
    private static final int CAMERA_REQUEST = 4002;

    private WebView webView;
    private TextView status;
    private ProgressBar progress;
    private String baseUrl;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest cameraRequest;
    private boolean loaded;
    private boolean mainFrameFailed;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(15, 23, 42));
        getWindow().setNavigationBarColor(Color.BLACK);
        getWindow().getDecorView().setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String configuredUrl = prefs.getString(PREF_SERVER, DEFAULT_URL);
        baseUrl = canonicalHttpsUrl(configuredUrl);
        if (baseUrl == null) baseUrl = DEFAULT_URL;
        setupLayout();
        if (state != null) {
            webView.restoreState(state);
        } else {
            loadHome();
        }
    }

    private void setupLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        root.setBackgroundColor(Color.WHITE);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(8), dp(7), dp(8), dp(7));
        bar.setBackgroundColor(Color.rgb(15, 23, 42));

        TextView title = new TextView(this);
        title.setText("العهدة");
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setTextSize(17);
        title.setTextColor(Color.WHITE);
        bar.addView(title, new LinearLayout.LayoutParams(0, dp(46), 1f));

        bar.addView(toolbarButton("الرئيسية", v -> loadHome()));
        bar.addView(toolbarButton("تحديث", v -> webView.reload()));
        bar.addView(toolbarButton("طباعة", v -> printCurrentPage()));
        bar.addView(toolbarButton("الاتصال", v -> showSettings()));
        root.addView(bar, new LinearLayout.LayoutParams(-1, dp(60)));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        root.addView(progress, new LinearLayout.LayoutParams(-1, dp(3)));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        webView.setWebViewClient(new SafeWebViewClient());
        webView.setWebChromeClient(new AppChromeClient());
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true); // Required by the existing React/Next application.
        s.setDomStorageEnabled(true); // The app's offline stocktake drafts use IndexedDB.
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        root.addView(webView, new LinearLayout.LayoutParams(-1, 0, 1f));

        status = new TextView(this);
        status.setText("الاتصال المشفر مطلوب، ويجب تشغيل برنامج ويندوز لخدمة الجرد");
        status.setTextColor(Color.rgb(71, 85, 105));
        status.setTextSize(11);
        status.setPadding(dp(10), dp(5), dp(10), dp(5));
        status.setSingleLine(true);
        status.setEllipsize(android.text.TextUtils.TruncateAt.END);
        root.addView(status, new LinearLayout.LayoutParams(-1, dp(27)));

        setContentView(root);
    }

    private Button toolbarButton(String label, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(11);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setTextColor(Color.WHITE);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(30, 64, 121)));
        button.setOnClickListener(listener);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, dp(45));
        lp.setMargins(dp(2), 0, dp(2), 0);
        button.setLayoutParams(lp);
        return button;
    }

    private int dp(int value) {
        return (int) (getResources().getDisplayMetrics().density * value + 0.5f);
    }

    private void loadHome() {
        loaded = false;
        webView.loadUrl(baseUrl);
    }

    // Accept HTTPS origins only. A direct TLS endpoint may be configured,
    // or a fixed Cloudflare Worker URL which redirects to a trycloudflare.com tunnel.
    private static String canonicalHttpsUrl(String input) {
        if (input == null) return null;
        try {
            URI u = new URI(input.trim());
            if (!"https".equalsIgnoreCase(u.getScheme()) || u.getHost() == null
                    || u.getUserInfo() != null || u.getPort() != -1) return null;
            String host = u.getHost().toLowerCase(Locale.ROOT);
            if (host.equals("localhost") || host.equals("127.0.0.1")
                    || host.equals("0.0.0.0") || host.endsWith(".local")) return null;
            if (u.getQuery() != null || u.getFragment() != null) return null;
            String path = u.getPath();
            if (path != null && !path.isEmpty() && !"/".equals(path)) return null;
            return "https://" + host;
        } catch (URISyntaxException e) {
            return null;
        }
    }

    private boolean allowedOrigin(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) return false;
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        String ownHost = Uri.parse(baseUrl).getHost();
        return host.equals(ownHost) || host.endsWith(".trycloudflare.com");
    }

    private void showSettings() {
        final EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setText(baseUrl);
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        LinearLayout frame = new LinearLayout(this);
        frame.setPadding(dp(22), dp(10), dp(22), dp(10));
        frame.addView(input, new LinearLayout.LayoutParams(-1, -2));

        new AlertDialog.Builder(this)
            .setTitle("رابط نظام العهدة")
            .setMessage("أدخل رابط HTTPS الآمن للنظام. يعمل خارج شبكة المكتب عند توفر اتصال خارجي مصرح به. لا تدخل عنوان HTTP.")
            .setView(frame)
            .setPositiveButton("حفظ واتصال", (d, which) -> {
                String normalized = canonicalHttpsUrl(input.getText().toString());
                if (normalized == null) {
                    status.setText("الرابط غير صالح؛ يلزم HTTPS واسم نطاق صحيح");
                    Toast.makeText(this, "الرابط يجب أن يبدأ بـ https://", Toast.LENGTH_LONG).show();
                    return;
                }
                baseUrl = normalized;
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(PREF_SERVER, baseUrl).apply();
                CookieManager.getInstance().flush();
                loadHome();
            })
            .setNegativeButton("إلغاء", null)
            .show();
    }

    private void printCurrentPage() {
        if (!loaded) {
            Toast.makeText(this, "افتح سند العهدة أولاً ثم اطبع", Toast.LENGTH_SHORT).show();
            return;
        }
        PrintManager printer = (PrintManager) getSystemService(Context.PRINT_SERVICE);
        String job = "سند العهدة - " + System.currentTimeMillis();
        printer.print(job, webView.createPrintDocumentAdapter(job), null);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        if (webView != null) webView.saveState(out);
        super.onSaveInstanceState(out);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            ((ViewGroup) webView.getParent()).removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == CAMERA_REQUEST && cameraRequest != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED)
                cameraRequest.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else cameraRequest.deny();
            cameraRequest = null;
        }
    }

    private final class SafeWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
            if (!request.isForMainFrame()) return false;
            if (allowedOrigin(request.getUrl())) return false;
            status.setText("تم منع رابط خارج خادم العهدة الموثوق");
            return true;
        }

        @Override
        public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) {
            progress.setProgress(10);
            loaded = false;
            mainFrameFailed = false;
            status.setText("جاري الاتصال الآمن...");
        }

        @Override
        public void onPageFinished(WebView v, String url) {
            progress.setProgress(100);
            if (!mainFrameFailed && allowedOrigin(Uri.parse(url))) {
                loaded = true;
                status.setText("متصل عبر HTTPS: " + Uri.parse(url).getHost());
            }
        }

        @Override
        public void onReceivedHttpError(WebView v, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame() && response.getStatusCode() >= 500) {
                loaded = false;
                mainFrameFailed = true;
                status.setText("الخدمة غير متاحة حالياً (HTTP " + response.getStatusCode() + ")؛ شغّل كمبيوتر العهدة والنفق");
            }
        }

        @Override
        public void onReceivedError(WebView v, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                loaded = false;
                mainFrameFailed = true;
                status.setText("تعذر الاتصال؛ تحقق من الإنترنت وتشغيل برنامج العهدة ثم اضغط تحديث");
            }
        }

        @Override
        public void onReceivedSslError(WebView v, SslErrorHandler handler, SslError error) {
            handler.cancel(); // Never bypass certificate errors.
            loaded = false;
            mainFrameFailed = true;
            status.setText("فشل التحقق من شهادة HTTPS؛ تم إيقاف الاتصال حماية للبيانات");
        }
    }

    private final class AppChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView v, int newProgress) {
            progress.setProgress(newProgress);
        }

        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            try {
                startActivityForResult(params.createIntent(), FILE_REQUEST);
                return true;
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                callback.onReceiveValue(null);
                Toast.makeText(MainActivity.this, "لا يتوفر تطبيق لاختيار الملفات", Toast.LENGTH_LONG).show();
                return false;
            }
        }

        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(() -> {
                if (!allowedOrigin(request.getOrigin())) {
                    request.deny();
                    return;
                }
                String[] resources = request.getResources();
                boolean videoOnly = resources.length == 1
                        && PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resources[0]);
                if (!videoOnly) {
                    request.deny();
                    return;
                }
                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                } else {
                    if (cameraRequest != null) cameraRequest.deny();
                    cameraRequest = request;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST);
                }
            });
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (cameraRequest == request) cameraRequest = null;
        }
    }
}
