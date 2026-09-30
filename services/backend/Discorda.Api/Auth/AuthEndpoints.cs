using Discorda.Core.Users;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Discorda.Api.Auth;

public static class AuthEndpoints
{
    public static void MapDiscordaAuth(this WebApplication app)
    {
        app.MapGet("/api/v1/auth/config", (IOptions<SupabaseOptions> options) =>
        {
            var settings = options.Value;
            return Results.Ok(new { enabled = settings.IsConfigured, supabaseUrl = settings.IsConfigured ? settings.Url.TrimEnd('/') : null,
                publishableKey = settings.IsConfigured ? settings.PublishableKey : null });
        }).AllowAnonymous();
        app.MapGet("/api/v1/auth/me", (HttpContext context) => Results.Ok(context.Items[typeof(MemberProfile)]))
            .RequireAuthorization("Member");
        app.MapPost("/api/v1/auth/logout", async (HttpContext context, DiscordaDbContext database) =>
        {
            var id = Guid.Parse(context.User.FindFirst("session_id")!.Value);
            var now = DateTimeOffset.UtcNow;
            await database.ApplicationSessions.Where(x => x.Id == id && x.RevokedAt == null)
                .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.RevokedAt, now), context.RequestAborted);
            return Results.NoContent();
        }).RequireAuthorization("Member");
    }
}
