using System.Threading.RateLimiting;
using Discorda.Api.Health;
using Discorda.Api.Auth;
using Discorda.Api.Chat;
using Discorda.Api.Media;
using Discorda.Api.Admin;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Discorda.Infrastructure;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Serilog;
using Serilog.Events;
using Serilog.Formatting.Compact;
using Microsoft.AspNetCore.HttpOverrides;
using System.Net;

var builder = WebApplication.CreateBuilder(args);
var selfHostConfig = Environment.GetEnvironmentVariable("DISCORDA_CONFIG_FILE");
if (!string.IsNullOrWhiteSpace(selfHostConfig)) builder.Configuration.AddJsonFile(selfHostConfig, optional: false, reloadOnChange: false);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 65536);
builder.Services.AddOptions<ForwardedHeadersOptions>().Configure<IConfiguration>((options, configuration) => {
    var trustedProxy = configuration["Proxy:TrustedIp"];
    if (!string.IsNullOrEmpty(trustedProxy)) {
        var proxyIp = IPAddress.Parse(trustedProxy);
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.ForwardLimit = 1;
        options.KnownProxies.Clear(); options.KnownIPNetworks.Clear();
        options.KnownProxies.Add(proxyIp);
    }
});
builder.Services.AddSingleton<NetworkPolicy>();
builder.Services.AddHttpClient("supabase-management", client => client.Timeout = TimeSpan.FromSeconds(15))
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddSerilog(configuration => configuration
    .MinimumLevel.Information()
    .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
    .MinimumLevel.Override("Yarp.ReverseProxy", LogEventLevel.Warning)
    .MinimumLevel.Override("System.Net.Http.HttpClient", LogEventLevel.Warning)
    .Enrich.FromLogContext()
    .WriteTo.Console(new RenderedCompactJsonFormatter()));
builder.Services.AddSingleton<OperationsCache>();
builder.Services.AddSingleton<MediaService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<MediaService>());
builder.Services.AddHttpClient("livekit", client => client.Timeout = TimeSpan.FromSeconds(5));
builder.Services.AddReverseProxy().LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
builder.Services.AddInfrastructure();
builder.Services.AddDiscordaAuth(builder.Configuration);
builder.Services.AddSignalR(options => { options.MaximumReceiveMessageSize = 4096; options.ClientTimeoutInterval = TimeSpan.FromSeconds(30); });
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<LiveChat>();
builder.Services.AddHostedService<PresenceWorker>();
builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("postgres", tags: ["ready"], timeout: TimeSpan.FromSeconds(3));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("admin-writes", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirst("sub")?.Value ?? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(context.User.Identity?.IsAuthenticated == true
            ? "user:" + context.User.FindFirst("sub")!.Value
            : "ip:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 120, Window = TimeSpan.FromMinutes(1), QueueLimit = 0
            }));
});

var app = builder.Build();
if (args.FirstOrDefault() == "migration-status")
{
    await using var scope = app.Services.CreateAsyncScope();
    Environment.ExitCode = (await scope.ServiceProvider.GetRequiredService<DiscordaDbContext>().Database.GetPendingMigrationsAsync()).Any() ? 10 : 0;
    return;
}
if (args.FirstOrDefault() == "migrate")
{
    await using var scope = app.Services.CreateAsyncScope();
    var database = scope.ServiceProvider.GetRequiredService<DiscordaDbContext>().Database;
    var runtimeRole = app.Configuration["Migration:RuntimeRole"];
    var grantSql = string.IsNullOrEmpty(runtimeRole) ? null : RuntimeDatabasePermissions.GrantSql(runtimeRole);
    await database.MigrateAsync();
    if (grantSql is not null) await database.ExecuteSqlRawAsync(grantSql);
    var email = app.Configuration["Admin:Email"];
    if (!string.IsNullOrWhiteSpace(email))
        Environment.ExitCode = await WhitelistCommand.RunAsync(app.Services, ["whitelist", "allow", email]);
    return;
}
if (args.FirstOrDefault() == "workspace")
{
    Environment.ExitCode = await WorkspaceCommand.RunAsync(app.Services, args);
    return;
}
if (args.FirstOrDefault() == "whitelist")
{
    Environment.ExitCode = await WhitelistCommand.RunAsync(app.Services, args);
    return;
}
app.UseExceptionHandler();
app.UseForwardedHeaders();
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers.CacheControl = "no-store";
    await next();
});
app.UseSerilogRequestLogging(options =>
{
    options.MessageTemplate = "HTTP {RequestMethod} {RequestPath} returned {StatusCode} in {Elapsed:0.0000} ms";
});

app.UseStaticFiles(new StaticFileOptions {
    OnPrepareResponse = context => {
        context.Context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
        context.Context.Response.Headers["Referrer-Policy"] = "no-referrer";
    }
});
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false }).AllowAnonymous();
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = check => check.Tags.Contains("ready") }).AllowAnonymous();
if (app.Environment.IsDevelopment()) app.MapOpenApi().AllowAnonymous();
app.MapDiscordaAuth();
app.MapDiscordaAdmin();
app.MapCommunityAdmin();
app.MapChat();
app.MapChatFeatures();
app.MapManagement();
app.MapMedia();
app.MapReverseProxy();
app.MapHub<ChatHub>("/api/v1/live", options => options.CloseOnAuthenticationExpiration = true).RequireAuthorization("Member");
app.Run();

public partial class Program;

