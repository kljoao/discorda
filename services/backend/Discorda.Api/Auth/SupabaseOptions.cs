using System.Text.Json;

namespace Discorda.Api.Auth;

public sealed class SupabaseOptions
{
    public string Url { get; set; } = "";
    public string PublishableKey { get; set; } = "";
    public string Issuer => Url.TrimEnd('/') + "/auth/v1";
    public bool IsConfigured => IsValidUrl(Url) && IsPublicKey(PublishableKey);

    public static bool IsValidUrl(string value) => Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && uri.Scheme == "https" && uri.AbsolutePath == "/" && uri.UserInfo == "" && uri.Query == "" && uri.Fragment == "";

    public static bool IsPublicKey(string value)
    {
        if (value.StartsWith("sb_publishable_", StringComparison.Ordinal)) return value.Length > 20;
        // Accept legacy anon keys, never a service_role key. This is a config check, not token validation.
        try
        {
            var parts = value.Split('.');
            if (parts.Length != 3) return false;
            var payload = parts[1].Replace('-', '+').Replace('_', '/');
            payload = payload.PadRight((payload.Length + 3) / 4 * 4, '=');
            using var json = JsonDocument.Parse(Convert.FromBase64String(payload));
            return json.RootElement.GetProperty("role").GetString() == "anon";
        }
        catch (Exception exception) when (exception is FormatException or JsonException or KeyNotFoundException) { return false; }
    }
}
