package fun.kasho.zhimy;

import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * 返回键优先让 WebView 后退（Next 的路由历史），退到底再交给系统退出 App。
     * 否则在 /chat、/node/[id] 里按返回会直接关掉应用。
     */
    @Override
    public void onBackPressed() {
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }
}
