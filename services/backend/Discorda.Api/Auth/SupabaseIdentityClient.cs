using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Discorda.Api.Auth;

public sealed record VerifiedIdentity(Guid Subject, string Email, string DisplayName, string? AvatarUrl = null);

public sealed class SupabaseIdentityClient(HttpClient client, IOptions<SupabaseOptions> options)
{
    public static string? GoogleAvatar(string? value) => value is { Length: <= 2048 } && Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == "https" && uri.IsDefaultPort && string.IsNullOrEmpty(uri.UserInfo) && (uri.Host == "googleusercontent.com" || uri.Host.EndsWith(".googleusercontent.com", StringComparison.OrdinalIgnoreCase)) ? uri.AbsoluteUri : null;
    public async Task<VerifiedIdentity?> GetAsync(string accessToken, Guid subject, CancellationToken cancellationToken)
    {
        var settings = options.Value;
        if (!settings.IsConfigured) return null;
        using var request = new HttpRequestMessage(HttpMethod.Get, settings.Issuer + "/user");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Headers.Add("apikey", settings.PublishableKey);
        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode) return null;
        using var user = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
        var root = user.RootElement;
        if (!root.TryGetProperty("id", out var id) || !Guid.TryParse(id.GetString(), out var actual) || actual != subject
            || !root.TryGetProperty("email_confirmed_at", out var confirmed) || confirmed.ValueKind != JsonValueKind.String
            || !DateTimeOffset.TryParse(confirmed.GetString(), out _)
            || !root.TryGetProperty("email", out var email) || string.IsNullOrWhiteSpace(email.GetString())
            || !root.TryGetProperty("identities", out var identities) || identities.ValueKind != JsonValueKind.Array
            || !identities.EnumerateArray().Any(identity => identity.TryGetProperty("provider", out var provider) && provider.GetString() == "google"))
            return null;
        var address = email.GetString()!.Trim().ToLowerInvariant();
        if (address.Length > 320) return null;
        var name = address.Split('@')[0];
        if (root.TryGetProperty("user_metadata", out var metadata) && metadata.TryGetProperty("full_name", out var fullName)
            && fullName.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(fullName.GetString())) name = fullName.GetString()!.Trim();
        // Metadata is display-only. Never use user-editable fields for verification or permissions.
        string? avatar = null;
        if (metadata.ValueKind == JsonValueKind.Object && metadata.TryGetProperty("avatar_url", out var photo) && photo.ValueKind == JsonValueKind.String) avatar = GoogleAvatar(photo.GetString());
        return new VerifiedIdentity(subject, address, name[..Math.Min(name.Length, 100)], avatar);
    }
}
