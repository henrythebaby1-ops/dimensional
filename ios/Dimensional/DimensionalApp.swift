// The whole game is the website in the www folder; this app just shows it full screen.
import SwiftUI
import WebKit
import UniformTypeIdentifiers

@main
struct DimensionalApp: App {
    var body: some Scene {
        WindowGroup {
            GameView()
                .ignoresSafeArea()
                .background(Color(red: 7 / 255, green: 6 / 255, blue: 15 / 255))
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
        }
    }
}

struct GameView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // ES modules won't load from file:// URLs, so the game files are served from a private app:// address
        config.setURLSchemeHandler(BundleFiles(), forURLScheme: "app")
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()   // keeps your profile, coins and skins between launches
        // page errors show up in the Xcode console
        config.userContentController.add(Console(), name: "log")
        config.userContentController.addUserScript(WKUserScript(source: """
            const send = (...a) => window.webkit.messageHandlers.log.postMessage(a.map(String).join(' '));
            addEventListener('error', e => send('error:', e.message, e.filename, e.lineno));
            addEventListener('unhandledrejection', e => send('rejection:', e.reason));
            const err = console.error; console.error = (...a) => { send('console.error:', ...a); err(...a); };
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsBackForwardNavigationGestures = false
        web.isInspectable = true
        web.load(URLRequest(url: URL(string: "app://game/index.html")!))
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {}
}

final class Console: NSObject, WKScriptMessageHandler {
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        NSLog("[game] %@", "\(message.body)")
    }
}

final class BundleFiles: NSObject, WKURLSchemeHandler {
    private let root = Bundle.main.resourceURL!.appendingPathComponent("www")

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path
        if path.isEmpty || path.hasSuffix("/") { path += "index.html" }
        let file = root.appendingPathComponent(path).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path), let data = try? Data(contentsOf: file) else {
            task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!)
            task.didFinish()
            return
        }
        let type = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let mime = file.pathExtension == "js" ? "text/javascript" : type
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                        headerFields: ["Content-Type": mime, "Content-Length": "\(data.count)", "Cache-Control": "no-store"])!)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
