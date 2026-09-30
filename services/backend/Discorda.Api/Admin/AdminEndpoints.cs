using System.Net;
using System.Net.Http.Headers;
using System.Net.Mail;
using System.Text.Json;
using System.Text.RegularExpressions;
using Discorda.Api.Auth;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Discorda.Api.Admin;

public static partial class AdminEndpoints
{
    public static bool IsAdmin(HttpContext context, IConfiguration configuration) =>
        context.Items[typeof(MemberProfile)] is MemberProfile profile &&
        !string.IsNullOrWhiteSpace(configuration["Admin:Email"]) &&
        string.Equals(profile.Email, configuration["Admin:Email"], StringComparison.OrdinalIgnoreCase);

    public static bool IsRadminAddress(string value) => IPAddress.TryParse(value, out var ip) &&
        ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork &&
        ip.GetAddressBytes()[0] == 26 && ip.ToString() == value;

    [GeneratedRegex(@"^https://([a-z0-9]{20})\.supabase\.co/?$")]
    private static partial Regex ProjectUrl();

    public static void MapDiscordaAdmin(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/admin").RequireAuthorization("Member");
        group.AddEndpointFilter(async (context, next) => IsAdmin(context.HttpContext, app.Configuration)
            ? await next(context) : Results.Forbid());
        group.MapGet("/settings", (IConfiguration config) => Results.Ok(new {
            adminEmail = config["Admin:Email"], supabaseUrl = config["Supabase:Url"],
            hostIp = config["SelfHost:HostIp"], networkPolicyRequiresHostApply = true
        }));
        group.MapGet("/users", async (DiscordaDbContext db, CancellationToken ct) =>
            Results.Ok(await db.AllowedUsers.OrderBy(x => x.NormalizedEmail)
                .Select(x => new { email = x.NormalizedEmail, enabled = x.Enabled }).ToArrayAsync(ct)));
        group.MapPut("/users", async (UserChange change, IServiceProvider services, IConfiguration config) => {
            if (!MailAddress.TryCreate(change.Email, out var address) || address.Address != change.Email || change.Email.Length > 320)
                return Results.BadRequest(new { error = "E-mail inválido." });
            if (!change.Enabled && string.Equals(change.Email, config["Admin:Email"], StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "O administrador não pode bloquear a própria conta." });
            await WhitelistCommand.RunAsync(services, ["whitelist", change.Enabled ? "allow" : "block", change.Email]);
            return Results.NoContent();
        });
        group.MapGet("/network", (NetworkPolicy policy) => Results.Ok(policy.Read()));
        group.MapPut("/network", async (NetworkChange change, NetworkPolicy policy) => {
            if (change.Addresses is null || change.Addresses.Length > 100 || change.Addresses.Any(x => !IsRadminAddress(x)))
                return Results.BadRequest(new { error = "Informe até 100 endereços IPv4 individuais do Radmin (26.x.x.x)." });
            await policy.SaveAsync(change.Addresses.Distinct().Order().ToArray());
            return Results.Ok(new { pendingHostApply = true });
        });
        group.MapGet("/network/script", (NetworkPolicy policy, IConfiguration config) => {
            var host = config["SelfHost:HostIp"] ?? "";
            if (!IsRadminAddress(host)) return Results.BadRequest();
            var peers = policy.Read();
            var script = "$ErrorActionPreference = 'Stop'\r\n# Execute como administrador no host Windows.\r\n" +
                "Get-NetFirewallRule -DisplayName 'Discorda SelfHost *' -ErrorAction SilentlyContinue | Remove-NetFirewallRule\r\n";
            if (peers.Length > 0)
                foreach (var (name, protocol, port) in new[] { ("API", "TCP", 7443), ("ICE TCP", "TCP", 7881), ("ICE UDP", "UDP", 7882) })
                    script += $"New-NetFirewallRule -DisplayName 'Discorda SelfHost {name}' -Direction Inbound -Action Allow -Protocol {protocol} -LocalPort {port} -LocalAddress {host} -RemoteAddress {string.Join(',', peers)} -Profile Any | Out-Null\r\n";
            return Results.File(System.Text.Encoding.UTF8.GetBytes(script), "text/plain", "discorda-firewall.ps1");
        });
        group.MapPost("/google", async (GoogleChange change, IConfiguration config, IHttpClientFactory clients, CancellationToken ct) => {
            var project = ProjectUrl().Match(config["Supabase:Url"] ?? "");
            if (!project.Success || string.IsNullOrWhiteSpace(change.ManagementToken) || change.ManagementToken.Length > 4096 ||
                change.ManagementToken.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('_' or '-')) ||
                string.IsNullOrWhiteSpace(change.ClientId) || !change.ClientId.EndsWith(".apps.googleusercontent.com", StringComparison.Ordinal) || change.ClientId.Length > 300 ||
                string.IsNullOrWhiteSpace(change.ClientSecret) || change.ClientSecret.Length > 1024)
                return Results.BadRequest(new { error = "Confira o projeto Supabase e as credenciais Google." });
            using var request = new HttpRequestMessage(HttpMethod.Patch,
                $"https://api.supabase.com/v1/projects/{project.Groups[1].Value}/config/auth");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", change.ManagementToken);
            request.Content = JsonContent.Create(new { external_google_enabled = true,
                external_google_client_id = change.ClientId, external_google_secret = change.ClientSecret });
            try {
                using var response = await clients.CreateClient("supabase-management").SendAsync(request, ct);
                return response.IsSuccessStatusCode ? Results.NoContent() :
                    Results.BadRequest(new { error = "O Supabase recusou a alteração. Verifique o token de gerenciamento e o projeto." });
            } catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException) {
                return Results.Problem("Não foi possível contatar o Supabase.", statusCode: 502);
            }
        });
    }
    public sealed record UserChange(string Email, bool Enabled);
    public sealed record NetworkChange(string[] Addresses);
    public sealed record GoogleChange(string ManagementToken, string ClientId, string ClientSecret);
}

public sealed class NetworkPolicy(IConfiguration configuration)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private string PathName => Path.Combine(configuration["SelfHost:StateDirectory"] ?? ".discorda", "network.json");
    public string[] Read() {
        if (!File.Exists(PathName)) return [];
        var values = JsonSerializer.Deserialize<string[]>(File.ReadAllText(PathName)) ?? [];
        return values.Where(AdminEndpoints.IsRadminAddress).Distinct().ToArray();
    }
    public async Task SaveAsync(string[] addresses) {
        await gate.WaitAsync();
        try {
            Directory.CreateDirectory(Path.GetDirectoryName(PathName)!);
            await File.WriteAllTextAsync(PathName + ".tmp", JsonSerializer.Serialize(addresses));
            File.Move(PathName + ".tmp", PathName, true);
        } finally { gate.Release(); }
    }
}
