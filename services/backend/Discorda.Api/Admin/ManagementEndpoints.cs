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
        group.MapGet("/members", async (HttpContext ctx,DiscordaDbContext db,MediaService media, CancellationToken ct) => {
            var policy=await ChannelPermissions.From(ctx).Load(ct);var actor=Permissions.User(ctx);
            if((policy.Base(actor)&(Permission.ManageRoles|Permission.ModerateVoice|Permission.ViewAudit))==0&&!policy.Channels.Keys.Any(id=>policy.Has(actor,Permission.ModerateVoice,id)))return Results.Forbid();
            var members = await (from m in db.WorkspaceMembers join u in db.Users on m.UserId equals u.Id
                where m.WorkspaceId == ChatEndpoints.GroupId orderby u.DisplayName select new { u.Id, u.DisplayName, u.Email, m.Role }).Take(500).ToArrayAsync(ct);
            return Results.Ok(members.Select(m => new { m.Id, m.DisplayName,
                role=(policy.Owner(m.Id)?MemberRole.Owner:(policy.Base(m.Id)&Permission.Administrator)!=0?MemberRole.Admin:(policy.Base(m.Id)&(Permission.ManageMessages|Permission.ModerateVoice))!=0?MemberRole.Moderator:MemberRole.Member).ToString(),
                position=policy.Position(m.Id),canModerateVoice=media.ChannelOf(m.Id) is Guid source&&m.Id!=actor&&policy.Position(actor)>policy.Position(m.Id)&&policy.Has(actor,Permission.ModerateVoice,source)}));
        });
        group.MapPut("/members/{userId:guid}/role", async (Guid userId, RoleChange input, HttpContext ctx, DiscordaDbContext db, LiveChat live, CancellationToken ct) => {
            if (!Enum.TryParse<MemberRole>(input.Role, out var role) || role is MemberRole.Owner || !Enum.IsDefined(role)) return Results.BadRequest();
            await using var tx = await Permissions.BeginChange(db, ct);
            var rank = Permissions.Rank(await Permissions.Role(ctx, app.Configuration, db, ct));
            if (userId == Permissions.User(ctx) || rank < 2 || rank <= Permissions.Rank(role) || rank <= Permissions.Rank(await Permissions.TargetRole(userId, app.Configuration, db, ct))) return Results.Forbid();
            var member = await db.WorkspaceMembers.SingleOrDefaultAsync(m => m.UserId == userId && m.WorkspaceId == ChatEndpoints.GroupId, ct);
            if (member is null) return Results.NotFound();
            member.Role = role;member.PermissionVersion++; Permissions.Audit(db, ctx, "role." + role, userId.ToString());
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            await live.Publish("channels", new { id = ChatEndpoints.GroupId }); return Results.NoContent();
        }).RequireRateLimiting("admin-writes");
        group.MapGet("/audit", async (long? before, HttpContext ctx, DiscordaDbContext db, CancellationToken ct) => {
            if (!await ChannelPermissions.From(ctx).Has(ctx,Permission.ViewAudit)) return Results.Forbid();
            return Results.Ok(await db.ManagementAudits.AsNoTracking().Where(x => !before.HasValue || x.Id < before).OrderByDescending(x => x.Id).Take(50)
                .Select(x => new { id = x.Id.ToString(), x.ActorId, x.Action, x.Target, x.CreatedAt }).ToArrayAsync(ct));
        });
        group.MapPost("/members/{userId:guid}/voice", async (Guid userId, VoiceChange input, HttpContext ctx, DiscordaDbContext db, MediaService media, LiveChat live, CancellationToken ct) => {
            await using var tx = await Permissions.BeginChange(db, ct);
            var policy=await ChannelPermissions.From(ctx).Load(ct);var actor=Permissions.User(ctx);var origin=media.ChannelOf(userId);
            if(userId==actor||policy.Position(actor)<=policy.Position(userId))return Results.Forbid();
            if(!origin.HasValue)return Results.NotFound();
            if(!policy.Has(actor,Permission.ModerateVoice,origin))return Results.Forbid();
            if(input.ChannelId.HasValue&&(!policy.Has(actor,Permission.ViewChannel|Permission.ConnectVoice,input.ChannelId)||!policy.Has(userId,Permission.ViewChannel|Permission.ConnectVoice,input.ChannelId)))return Results.Forbid();
            if (input.ChannelId is Guid channel && !await db.Channels.AnyAsync(c => c.Id == channel && c.WorkspaceId == ChatEndpoints.GroupId && c.Type == Discorda.Core.Channels.ChannelType.Voice && c.ArchivedAt == null, ct)) return Results.NotFound();
            // Revoke admission before notifying the client; UI is not the authority.
            if (!await media.Moderate(userId, input.ChannelId, ct)) return Results.NotFound();
            Permissions.Audit(db, ctx, input.ChannelId is null ? "voice.remove" : "voice.move", userId.ToString()); await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            await live.Publish("moderation", new { userId, channelId = input.ChannelId }); return Results.NoContent();
        }).RequireRateLimiting("admin-writes");
    }
}
