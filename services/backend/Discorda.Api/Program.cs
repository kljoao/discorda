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
builder.Services.AddSingleton<AuthenticationBudget>();
builder.Services.AddSignalR(options => { options.MaximumReceiveMessageSize = 4096; options.ClientTimeoutInterval = TimeSpan.FromSeconds(30); });
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<LiveChat>();
builder.Services.AddHostedService<PresenceWorker>();
builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("postgres", tags: ["ready"], timeout: TimeSpan.FromSeconds(3));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("attachments", _ => RateLimitPartition.GetConcurrencyLimiter("attachments", _ => new ConcurrencyLimiterOptions { PermitLimit = 2, QueueLimit = 0 }));
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
    var runtimePassword = app.Configuration["Migration:RuntimePassword"];
    if (!string.IsNullOrEmpty(runtimePassword) && !string.IsNullOrEmpty(runtimeRole))
    {
        var createSql = RuntimeDatabasePermissions.CreateSql(runtimeRole, runtimePassword);
        var exists = await database.SqlQuery<int>($"SELECT 1 AS \"Value\" FROM pg_roles WHERE rolname = {runtimeRole}").AnyAsync();
        if (!exists)
        {
            await using var transaction = await database.BeginTransactionAsync();
            await database.ExecuteSqlInterpolatedAsync($"SELECT set_config('discorda.runtime_password', {runtimePassword}, true)");
            await database.ExecuteSqlRawAsync(createSql);
            await transaction.CommitAsync();
        }
        var elevated = await database.SqlQuery<int>($"""
            SELECT 1 AS "Value" FROM pg_roles r WHERE r.rolname = {runtimeRole} AND (
                r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
                OR EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid)
                OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspowner = r.oid)
                OR EXISTS (SELECT 1 FROM pg_class c WHERE c.relowner = r.oid)
                OR EXISTS (SELECT 1 FROM pg_database d WHERE d.datdba = r.oid))
            """).AnyAsync();
        if (elevated) throw new InvalidOperationException("Runtime database role has excessive privileges.");
    }
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
app.Use((context, next) => app.Services.GetRequiredService<AuthenticationBudget>().Invoke(context, next));
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false }).AllowAnonymous();
app.MapGet("/api/v1/compatibility", () => Results.Ok(new { protocol = 1, version = typeof(Program).Assembly.GetName().Version?.ToString(3) })).AllowAnonymous();
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = check => check.Tags.Contains("ready") }).AllowAnonymous();
if (app.Environment.IsDevelopment()) app.MapOpenApi().AllowAnonymous();
app.MapDiscordaAuth();
app.MapDiscordaAdmin();
app.MapCommunityAdmin();
app.MapInvitations();
app.MapStorageManagement();
app.MapChat();
app.MapChatFeatures();
app.MapAttachments();
app.MapInbox();
app.MapTemporaryRooms();
app.MapManagement();
app.MapMedia();
app.MapReverseProxy();
app.MapHub<ChatHub>("/api/v1/live", options => options.CloseOnAuthenticationExpiration = true).RequireAuthorization("Member");
app.Run();

public partial class Program;

