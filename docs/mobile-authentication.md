# Mobile Authentication Guide

This guide covers implementing AT Protocol OAuth for native mobile applications
(iOS, Android) using `@tijs/atproto-oauth`.

## Overview

This library implements the
[Backend-for-Frontend (BFF) pattern](https://atproto.com/specs/oauth#confidential-client-backend-for-frontend)
recommended by AT Protocol for mobile apps requiring long-lived sessions. Your
server acts as the OAuth client, keeping tokens secure while the mobile app
receives a session cookie.

Mobile authentication uses a secure WebView flow:

1. App opens a secure browser (ASWebAuthenticationSession on iOS, Custom Tabs on
   Android)
2. User enters their handle and completes OAuth in the browser
3. Your server completes the OAuth exchange
4. Server redirects to your app's URL scheme with session credentials
5. App extracts credentials and stores them securely

This approach keeps OAuth tokens on your server while giving the mobile app a
session token for authenticated requests.

## Server Configuration

### Enable Mobile Support

Add `mobileScheme` to your OAuth configuration:

```typescript
const oauth = createATProtoOAuth({
  baseUrl: "https://myapp.example.com",
  appName: "My App",
  cookieSecret: Deno.env.get("COOKIE_SECRET")!,
  storage: new SQLiteStorage(valTownAdapter(sqlite)),
  sessionTtl: 60 * 60 * 24 * 14,
  mobileScheme: "myapp://auth-callback", // Your app's URL scheme
});
```

The `mobileScheme` is the URL your app registers to handle OAuth callbacks.

### How It Works

When `/login` receives `mobile=true`:

1. The OAuth flow proceeds normally
2. After successful authentication, instead of redirecting to a web page, the
   callback redirects to your `mobileScheme` with:
   - `session_token`: Sealed session token for cookie authentication
   - `did`: User's DID
   - `handle`: User's handle

Example callback URL:

```
myapp://auth-callback?session_token=Fe26.2**abc...&did=did:plc:xyz&handle=alice.bsky.social
```

## iOS Implementation

### Register URL Scheme

In your `Info.plist` or Xcode project settings, register your URL scheme:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>myapp</string>
    </array>
    <key>CFBundleURLName</key>
    <string>com.example.myapp</string>
  </dict>
</array>
```

### Start OAuth Flow

Use `ASWebAuthenticationSession` for secure OAuth:

```swift
import AuthenticationServices

class AuthManager: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var authSession: ASWebAuthenticationSession?

    func startLogin(handle: String) {
        // Build login URL with mobile=true
        var components = URLComponents(string: "https://myapp.example.com/login")!
        components.queryItems = [
            URLQueryItem(name: "handle", value: handle),
            URLQueryItem(name: "mobile", value: "true")
        ]

        guard let url = components.url else { return }

        // Create secure auth session
        authSession = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: "myapp"
        ) { [weak self] callbackURL, error in
            self?.handleCallback(callbackURL: callbackURL, error: error)
        }

        authSession?.presentationContextProvider = self
        authSession?.prefersEphemeralWebBrowserSession = false
        authSession?.start()
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? UIWindow()
    }
}
```

### Handle Callback

Extract credentials from the callback URL:

```swift
func handleCallback(callbackURL: URL?, error: Error?) {
    if let error = error as? ASWebAuthenticationSessionError,
       error.code == .canceledLogin {
        // User cancelled - not an error
        return
    }

    guard let url = callbackURL,
          let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
          let queryItems = components.queryItems else {
        // Handle error
        return
    }

    // Extract credentials
    guard let sessionToken = queryItems.first(where: { $0.name == "session_token" })?.value,
          let did = queryItems.first(where: { $0.name == "did" })?.value,
          let handle = queryItems.first(where: { $0.name == "handle" })?.value else {
        // Handle missing parameters
        return
    }

    // Store session token securely (Keychain recommended)
    saveToKeychain(sessionToken: sessionToken, did: did, handle: handle)

    // Set up cookie for API requests
    setSessionCookie(sessionToken: sessionToken)
}
```

### Cookie-Based API Requests

The session token is an Iron Session sealed cookie value. Set it as a cookie for
API requests:

```swift
func setSessionCookie(sessionToken: String) {
    let cookie = HTTPCookie(properties: [
        .name: "sid",
        .value: sessionToken,
        .domain: "myapp.example.com",
        .path: "/",
        .secure: true,
        .expires: Date().addingTimeInterval(60 * 60 * 24 * 14) // 14 days
    ])!

    HTTPCookieStorage.shared.setCookie(cookie)
}

// API requests automatically include the cookie
func fetchProfile() async throws -> Profile {
    let url = URL(string: "https://myapp.example.com/api/profile")!
    let (data, _) = try await URLSession.shared.data(from: url)
    return try JSONDecoder().decode(Profile.self, from: data)
}
```

## Android Implementation

### Register URL Scheme

In your `AndroidManifest.xml`:

```xml
<activity android:name=".AuthCallbackActivity"
          android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="myapp"
              android:host="auth-callback" />
    </intent-filter>
</activity>
```

### Start OAuth Flow

Use Custom Tabs for secure OAuth:

```kotlin
import androidx.browser.customtabs.CustomTabsIntent

fun startLogin(handle: String) {
    val url = Uri.parse("https://myapp.example.com/login")
        .buildUpon()
        .appendQueryParameter("handle", handle)
        .appendQueryParameter("mobile", "true")
        .build()

    val customTabsIntent = CustomTabsIntent.Builder().build()
    customTabsIntent.launchUrl(context, url)
}
```

### Handle Callback

In your callback activity:

```kotlin
class AuthCallbackActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        intent.data?.let { uri ->
            val sessionToken = uri.getQueryParameter("session_token")
            val did = uri.getQueryParameter("did")
            val handle = uri.getQueryParameter("handle")

            if (sessionToken != null && did != null && handle != null) {
                // Store securely (EncryptedSharedPreferences recommended)
                saveCredentials(sessionToken, did, handle)

                // Set up cookie for API requests
                setSessionCookie(sessionToken)
            }
        }

        // Return to main app
        finish()
    }
}
```

### Cookie-Based API Requests

```kotlin
fun setSessionCookie(sessionToken: String) {
    val cookieManager = CookieManager.getInstance()
    val cookie = "sid=$sessionToken; Path=/; Secure; HttpOnly"
    cookieManager.setCookie("https://myapp.example.com", cookie)
}
```

## Session Validation

After setting the cookie, validate the session by calling your session endpoint:

```swift
// iOS
func validateSession() async throws -> Bool {
    let url = URL(string: "https://myapp.example.com/api/auth/session")!
    let (data, response) = try await URLSession.shared.data(from: url)

    guard let httpResponse = response as? HTTPURLResponse,
          httpResponse.statusCode == 200 else {
        return false
    }

    let session = try JSONDecoder().decode(SessionResponse.self, from: data)
    return session.authenticated
}
```

## Session Restoration

On app launch, restore the session from secure storage:

```swift
func restoreSession() {
    guard let sessionToken = loadFromKeychain() else {
        // No stored session
        return
    }

    // Recreate cookie
    setSessionCookie(sessionToken: sessionToken)

    // Validate session is still valid
    Task {
        let isValid = try await validateSession()
        if !isValid {
            // Session expired, clear and prompt login
            clearCredentials()
        }
    }
}
```

## Security Considerations

1. **Secure Storage**: Store credentials in iOS Keychain or Android
   EncryptedSharedPreferences.

2. **URL Scheme**: Use a unique scheme unlikely to conflict with other apps.
   Consider using a reverse-domain format.

3. **Ephemeral Sessions**: Set `prefersEphemeralWebBrowserSession = false` on
   iOS to allow SSO with existing Bluesky sessions.

4. **Token Security**: The `session_token` is cryptographically sealed. It
   cannot be tampered with or forged.

5. **Server-Side Tokens**: OAuth access/refresh tokens stay on your server. The
   mobile app only receives a session identifier.

## Mobile Login Page

For the best user experience, create a dedicated mobile login page:

```typescript
// /mobile-auth route
app.get("/mobile-auth", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Sign in - My App</title>
      </head>
      <body>
        <h1>Sign in to My App</h1>
        <form action="/login" method="get">
          <input type="hidden" name="mobile" value="true">
          <input type="text" name="handle" placeholder="alice.bsky.social" required>
          <button type="submit">Continue</button>
        </form>
      </body>
    </html>
  `);
});
```

This provides a clean login experience within the secure WebView.

## Troubleshooting

### Callback Not Received

- Verify URL scheme is registered correctly
- Check that `mobileScheme` matches your registered scheme exactly
- On iOS, ensure `callbackURLScheme` matches (without `://`)

### Session Invalid After Callback

- Verify the session token is being set as a cookie correctly
- Check cookie domain matches your API domain
- Ensure cookies are being sent with requests (`credentials: "include"`)

### "Invalid state" Error

- The OAuth state expired (default: 10 minutes)
- User took too long to complete authorization
- Start a new login flow

## Resources

### AT Protocol Documentation

- [OAuth Specification](https://atproto.com/specs/oauth) - Full OAuth spec
  including mobile client requirements
- [OAuth Introduction](https://atproto.com/guides/oauth) - Overview of OAuth
  patterns and app types
- [BFF Pattern](https://atproto.com/specs/oauth#confidential-client-backend-for-frontend) -
  Backend-for-Frontend architecture details

### Example Implementations

- [React Native OAuth Example](https://github.com/bluesky-social/cookbook/tree/main/react-native-oauth) -
  Official Bluesky mobile example using `@atproto/oauth-client-expo`
- [Go OAuth Web App](https://github.com/bluesky-social/cookbook/tree/main/go-oauth-web-app) -
  BFF pattern implementation in Go
- [Python OAuth Web App](https://github.com/bluesky-social/cookbook/tree/main/python-oauth-web-app) -
  BFF pattern implementation in Python

### iOS Swift Package

- [ATProtoFoundation](https://github.com/tijs/ATProtoFoundation) - Swift package
  providing the iOS client-side implementation for this library's BFF pattern,
  including `IronSessionMobileOAuthCoordinator` for handling the OAuth flow and
  `KeychainCredentialsStorage` for secure credential storage.

### Alternative Approaches

This library uses the BFF pattern where OAuth tokens stay on your server. If you
prefer tokens on the device, consider:

- [@atproto/oauth-client-expo](https://www.npmjs.com/package/@atproto/oauth-client-expo) -
  Official Bluesky SDK for React Native (tokens on device)

The BFF pattern is recommended when you need:

- Long-lived sessions (up to 14 days for public clients)
- Server-side API calls on behalf of users
- Simplified mobile client code
