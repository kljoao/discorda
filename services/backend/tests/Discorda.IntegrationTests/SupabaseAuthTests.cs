using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Discorda.Api.Auth;
using Discorda.Core.Users;
using Discorda.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Testcontainers.PostgreSql;

namespace Discorda.IntegrationTests;

public sealed class AuthFixture : IAsyncLifetime
{
    public const string Issuer = "https://auth-test.supabase.co/auth/v1";
    public readonly PostgreSqlContainer Postgres = new PostgreSqlBuilder("postgres:17.11-alpine3.23").Build();
    private readonly RSA _rsa = RSA.Create(2048);
    public RsaSecurityKey Key { get; }
    private string _runtimeConnection = "";
    public AuthFixture() { Key = new RsaSecurityKey(_rsa) { KeyId = "test-signing-key" }; }
    public DiscordaDbContext Database() => new(new DbContextOptionsBuilder<DiscordaDbContext>()
        .UseNpgsql(Postgres.GetConnectionString(), options => options.MigrationsHistoryTable("__EFMigrationsHistory", "discorda")).Options);
    public async Task InitializeAsync()
    {
        await Postgres.StartAsync(); await using var db = Database(); await db.Database.MigrateAsync();
        var password = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        await using (var tx = await db.Database.BeginTransactionAsync())
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT set_config('discorda.runtime_password', {password}, true)");
            await db.Database.ExecuteSqlRawAsync(RuntimeDatabasePermissions.CreateSql("discorda_runtime", password));
            await tx.CommitAsync();
        }
        await db.Database.ExecuteSqlRawAsync(RuntimeDatabasePermissions.GrantSql("discorda_runtime"));
        _runtimeConnection = new Npgsql.NpgsqlConnectionStringBuilder(Postgres.GetConnectionString()) { Username = "discorda_runtime", Password = password }.ConnectionString;
    }
    public async Task DisposeAsync() { await Postgres.DisposeAsync(); _rsa.Dispose(); }

    public WebApplicationFactory<Program> App(bool verified = true, string provider = "google", string? publicKey = null) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Production");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Database"] = _runtimeConnection,
                ["Supabase:Url"] = "https://auth-test.supabase.co",
                ["Supabase:PublishableKey"] = publicKey ?? "sb_publishable_test_public_key"
            }));
            builder.ConfigureServices(services =>
            {
                services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
                {
                    var metadata = new OpenIdConnectConfiguration { Issuer = Issuer };
                    metadata.SigningKeys.Add(Key);
                    options.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(metadata);
                });
                services.AddHttpClient<SupabaseIdentityClient>().ConfigurePrimaryHttpMessageHandler(() => new IdentityStub(verified, provider));
            });
        });

    public string Token(Guid subject, Guid session, string email, string? issuer = null, string audience = "authenticated", bool expired = false)
    {
        var token = new JwtSecurityToken(issuer ?? Issuer, audience,
            [new Claim("sub", subject.ToString()), new Claim("session_id", session.ToString()), new Claim("email", email), new Claim("role", "authenticated")],
            DateTime.UtcNow.AddMinutes(-10), expired ? DateTime.UtcNow.AddMinutes(-5) : DateTime.UtcNow.AddMinutes(5),
            new SigningCredentials(Key, SecurityAlgorithms.RsaSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private sealed class IdentityStub(bool verified, string provider) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var claims = new JwtSecurityTokenHandler().ReadJwtToken(request.Headers.Authorization!.Parameter);
            var json = JsonSerializer.Serialize(new
            {
                id = claims.Subject, email = claims.Claims.Single(x => x.Type == "email").Value,
                email_confirmed_at = verified ? "2026-01-01T00:00:00Z" : null,
                identities = new[] { new { provider } }, user_metadata = new { full_name = "Friend", email_verified = true }
            });
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") });
        }
    }
}

public sealed class SupabaseAuthTests(AuthFixture fixture) : IClassFixture<AuthFixture>
{
    [Fact]
    public async Task WhitelistConcurrentAdmissionAndLogoutAreEnforced()
    {
        var subject = Guid.NewGuid(); var session = Guid.NewGuid(); var email = subject + "@example.test";
        await using var app = fixture.App();
        using var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", fixture.Token(subject, session, email));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        await using (var db = fixture.Database()) { db.AllowedUsers.Add(new AllowedUser { NormalizedEmail = email }); await db.SaveChangesAsync(); }
        var requests = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => client.GetAsync("/api/v1/auth/me")));
        Assert.All(requests, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/v1/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        await using var verify = fixture.Database();
        Assert.Single(await verify.Users.Where(x => x.AuthSubject == subject.ToString()).ToListAsync());
        Assert.NotNull((await verify.ApplicationSessions.SingleAsync(x => x.Id == session)).RevokedAt);
    }

    [Fact]
    public async Task BlockRevokesOldSessionsAndBindingCannotBeReusedByAnotherIdentity()
    {
        var subject = Guid.NewGuid(); var session = Guid.NewGuid(); var email = subject + "@example.test";
        await using var app = fixture.App();
        using var client = app.CreateClient();
        await WhitelistCommand.RunAsync(app.Services, ["whitelist", "allow", email]);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", fixture.Token(subject, session, email));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        await WhitelistCommand.RunAsync(app.Services, ["whitelist", "block", email]);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        await WhitelistCommand.RunAsync(app.Services, ["whitelist", "allow", email]);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", fixture.Token(Guid.NewGuid(), Guid.NewGuid(), email));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", fixture.Token(subject, Guid.NewGuid(), email));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }

    [Theory]
    [InlineData("issuer")]
    [InlineData("audience")]
    [InlineData("expired")]
    [InlineData("signature")]
    public async Task InvalidTokensCannotAccessTheApi(string failure)
    {
        await using var app = fixture.App();
        using var client = app.CreateClient();
        var token = fixture.Token(Guid.NewGuid(), Guid.NewGuid(), "friend@example.test",
            issuer: failure == "issuer" ? "https://evil.test" : null,
            audience: failure == "audience" ? "another-app" : "authenticated", expired: failure == "expired");
        if (failure == "signature") { var parts = token.Split('.'); parts[2] = (parts[2][0] == 'a' ? "b" : "a") + parts[2][1..]; token = string.Join('.', parts); }
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }

    [Theory]
    [InlineData(false, "google")]
    [InlineData(true, "email")]
    public async Task MutableUserMetadataDoesNotProveEmailOrGoogleIdentity(bool verified, string provider)
    {
        await using var app = fixture.App(verified, provider);
        using var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", fixture.Token(Guid.NewGuid(), Guid.NewGuid(), "friend@example.test"));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }

    [Fact]
    public async Task PrivateKeysAreNeverExposedByPublicConfiguration()
    {
        await using var app = fixture.App(publicKey: "sb_secret_do_not_publish");
        using var client = app.CreateClient();
        var body = await client.GetStringAsync("/api/v1/auth/config");
        Assert.DoesNotContain("sb_secret", body);
        Assert.Contains("\"enabled\":false", body);
    }
}

