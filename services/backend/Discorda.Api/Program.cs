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

var builder = WebApplication.CreateBuilder(args);
var selfHostConfig = Environment.GetEnvironmentVariable("DISCORDA_CONFIG_FILE");
if (!string.IsNullOrWhiteSpace(selfHostConfig)) builder.Configuration.AddJsonFile(selfHostConfig, optional: false, reloadOnChange: false);
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
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 120, Window = TimeSpan.FromMinutes(1), QueueLimit = 0
            }));
});

var app = builder.Build();
if (args.FirstOrDefault() == "migrate")
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<DiscordaDbContext>().Database.MigrateAsync();
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
app.UseRateLimiter();
app.UseStaticFiles(new StaticFileOptions {
    OnPrepareResponse = context => {
        context.Context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
        context.Context.Response.Headers["Referrer-Policy"] = "no-referrer";
    }
});
app.UseAuthentication();
app.UseAuthorization();
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false }).AllowAnonymous();
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = check => check.Tags.Contains("ready") }).AllowAnonymous();
if (app.Environment.IsDevelopment()) app.MapOpenApi().AllowAnonymous();
app.MapDiscordaAuth();
app.MapDiscordaAdmin();
app.MapChat();
app.MapMedia();
app.MapReverseProxy();
app.MapHub<ChatHub>("/api/v1/live", options => options.CloseOnAuthenticationExpiration = true).RequireAuthorization("Member");
app.Run();

public partial class Program;

