using Discorda.Api.Auth;
using Discorda.Api.Chat;
using Discorda.Api.Media;
using Discorda.Core.Workspaces;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Discorda.Api.Admin;

public static class ManagementEndpoints
{
    public sealed record RoleChange(string Role);
    public sealed record VoiceChange(Guid? ChannelId);
    public static void MapManagement(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/chat/management").RequireAuthorization("Member");
        group.AddEndpointFilter(async (context, next) => {
            var db = context.HttpContext.RequestServices.GetRequiredService<DiscordaDbContext>();
            return Permissions.Rank(await Permissions.Role(context.HttpContext, app.Configuration, db, context.HttpContext.RequestAborted)) >= 1 ? await next(context) : Results.Forbid();
        });
        group.MapGet("/members", async (DiscordaDbContext db, CancellationToken ct) => {
            var members = await (from m in db.WorkspaceMembers join u in db.Users on m.UserId equals u.Id
                where m.WorkspaceId == ChatEndpoints.GroupId orderby u.DisplayName select new { u.Id, u.DisplayName, u.Email, m.Role }).Take(500).ToArrayAsync(ct);
            return Results.Ok(members.Select(m => new { m.Id, m.DisplayName, role = (string.Equals(m.Email, app.Configuration["Admin:Email"], StringComparison.OrdinalIgnoreCase) ? MemberRole.Owner : m.Role == MemberRole.Owner ? MemberRole.Member : m.Role).ToString() }));
        });
        group.MapPut("/members/{userId:guid}/role", async (Guid userId, RoleChange input, HttpContext ctx, DiscordaDbContext db, LiveChat live, CancellationToken ct) => {
            if (!Enum.TryParse<MemberRole>(input.Role, out var role) || role is MemberRole.Owner || !Enum.IsDefined(role)) return Results.BadRequest();
            var rank = Permissions.Rank(await Permissions.Role(ctx, app.Configuration, db, ct));
            if (userId == Permissions.User(ctx) || rank < 2 || rank <= Permissions.Rank(role) || rank <= Permissions.Rank(await Permissions.TargetRole(userId, app.Configuration, db, ct))) return Results.Forbid();
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var member = await db.WorkspaceMembers.SingleOrDefaultAsync(m => m.UserId == userId && m.WorkspaceId == ChatEndpoints.GroupId, ct);
            if (member is null) return Results.NotFound();
            member.Role = role; Permissions.Audit(db, ctx, "role." + role, userId.ToString());
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            await live.Publish("channels", new { id = ChatEndpoints.GroupId }); return Results.NoContent();
        }).RequireRateLimiting("admin-writes");
        group.MapGet("/audit", async (long? before, HttpContext ctx, DiscordaDbContext db, CancellationToken ct) => {
            if (Permissions.Rank(await Permissions.Role(ctx, app.Configuration, db, ct)) < 2) return Results.Forbid();
            return Results.Ok(await db.ManagementAudits.AsNoTracking().Where(x => !before.HasValue || x.Id < before).OrderByDescending(x => x.Id).Take(50)
                .Select(x => new { id = x.Id.ToString(), x.ActorId, x.Action, x.Target, x.CreatedAt }).ToArrayAsync(ct));
        });
        group.MapPost("/members/{userId:guid}/voice", async (Guid userId, VoiceChange input, HttpContext ctx, DiscordaDbContext db, MediaService media, LiveChat live, CancellationToken ct) => {
            if (userId == Permissions.User(ctx) || Permissions.Rank(await Permissions.Role(ctx, app.Configuration, db, ct)) <= Permissions.Rank(await Permissions.TargetRole(userId, app.Configuration, db, ct))) return Results.Forbid();
            if (input.ChannelId is Guid channel && !await db.Channels.AnyAsync(c => c.Id == channel && c.WorkspaceId == ChatEndpoints.GroupId && c.Type == Discorda.Core.Channels.ChannelType.Voice && c.ArchivedAt == null, ct)) return Results.NotFound();
            // Revoke admission before notifying the client; UI is not the authority.
            if (!await media.Moderate(userId, input.ChannelId, ct)) return Results.NotFound();
            Permissions.Audit(db, ctx, input.ChannelId is null ? "voice.remove" : "voice.move", userId.ToString()); await db.SaveChangesAsync(ct);
            await live.Publish("moderation", new { userId, channelId = input.ChannelId }); return Results.NoContent();
        }).RequireRateLimiting("admin-writes");
    }
}
