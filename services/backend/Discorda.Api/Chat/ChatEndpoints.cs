using Discorda.Api.Admin;
using Discorda.Api.Auth;
using Discorda.Core.Channels;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Discorda.Api.Chat;

public sealed record SendMessage(Guid ClientId, string Body, long? ReplyToId);
public sealed record EditMessage(string Body, long Version);
public sealed record NewChannel(string Name);
public sealed record EditProfile(string DisplayName);
public sealed record MessageView(string Id, Guid ChannelId, Guid AuthorId, string AuthorName, Guid ClientId,
    string Body, string? ReplyToId, DateTimeOffset CreatedAt, DateTimeOffset? EditedAt, DateTimeOffset? DeletedAt, long Version, Guid? ReplyAuthorId);

public static class ChatEndpoints
{
    public static readonly Guid GroupId = Guid.Parse("786f3c3b-14ca-4c93-b0a1-9f782ef8c044");
    private static Guid UserId(HttpContext context) => ((MemberProfile)context.Items[typeof(MemberProfile)]!).Id;
    private static bool ValidBody(string? body) => !string.IsNullOrWhiteSpace(body) && body.Length <= 4000 && !body.Contains('\0');
    internal static Task<bool> Access(DiscordaDbContext db, Guid channelId, Guid user, CancellationToken ct) =>
        db.Channels.AnyAsync(c => c.Id == channelId && c.WorkspaceId == GroupId && c.Type == ChannelType.Text && c.ArchivedAt == null
            && db.WorkspaceMembers.Any(m => m.WorkspaceId == c.WorkspaceId && m.UserId == user), ct);
    internal static IQueryable<MessageView> Views(DiscordaDbContext db, System.Linq.Expressions.Expression<Func<Message, bool>> filter) => from message in db.Messages.AsNoTracking().Where(filter)
        join author in db.Users on message.AuthorId equals author.Id
        select new MessageView(message.Id.ToString(), message.ChannelId, message.AuthorId, author.DisplayName, message.ClientId,
            message.DeletedAt == null ? message.Body : "", message.ReplyToId == null ? null : message.ReplyToId.ToString(),
            message.CreatedAt, message.EditedAt, message.DeletedAt, message.Version, db.Messages.Where(parent => parent.Id == message.ReplyToId && parent.ChannelId == message.ChannelId).Select(parent => (Guid?)parent.AuthorId).FirstOrDefault());

    public static void MapChat(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1/chat").RequireAuthorization("Member");
        api.MapGet("/members", async (HttpContext ctx, DiscordaDbContext db, LiveChat live, CancellationToken ct) =>
            !await db.WorkspaceMembers.AnyAsync(m => m.WorkspaceId == GroupId && m.UserId == UserId(ctx), ct)
                ? Results.Forbid() : Results.Ok(await live.GetMembers(ct)));
        api.MapPut("/profile", async (EditProfile input, HttpContext ctx, DiscordaDbContext db, LiveChat live, CancellationToken ct) =>
        {
            var name = input.DisplayName?.Trim().Normalize();
            if (string.IsNullOrWhiteSpace(name) || name.Length > 32 || name.Any(c => char.IsControl(c) || char.GetUnicodeCategory(c) == System.Globalization.UnicodeCategory.Format)) return Results.BadRequest();
            var user = await db.Users.SingleAsync(x => x.Id == UserId(ctx), ct);
            user.CustomDisplayName = name; user.DisplayName = name;
            await db.SaveChangesAsync(ct);
            await live.Rename(user.Id, name);
            return Results.Ok(new MemberProfile(user.Id, name, user.Email, ((MemberProfile)ctx.Items[typeof(MemberProfile)]!).AvatarUrl));
        });
        api.MapGet("/workspace", async (HttpContext ctx, DiscordaDbContext db, LiveChat live, CancellationToken ct) =>
        {
            var workspace = await db.Workspaces.SingleOrDefaultAsync(x => x.Id == GroupId, ct);
            if (workspace is null) return Results.Problem(statusCode: 503, title: "Workspace not configured");
            var user = UserId(ctx);
            // All whitelisted members belong to this one private workspace. Never auto-promote an owner.
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO discorda.workspace_members (\"WorkspaceId\", \"UserId\", \"Role\", \"JoinedAt\") VALUES ({GroupId}, {user}, 'Member', {DateTimeOffset.UtcNow}) ON CONFLICT DO NOTHING", ct);
            // Only the administrator explicitly configured by the host can be promoted automatically.
            if (Discorda.Api.Admin.AdminEndpoints.IsAdmin(ctx, app.Configuration))
                await db.WorkspaceMembers.Where(x => x.WorkspaceId == GroupId && x.UserId == user)
                    .ExecuteUpdateAsync(set => set.SetProperty(x => x.Role, Discorda.Core.Workspaces.MemberRole.Owner), ct);
            // A former configured administrator must not retain effective owner powers.
            if (!Discorda.Api.Admin.AdminEndpoints.IsAdmin(ctx, app.Configuration))
                await db.WorkspaceMembers.Where(x => x.WorkspaceId == GroupId && x.UserId == user && x.Role == Discorda.Core.Workspaces.MemberRole.Owner)
                    .ExecuteUpdateAsync(set => set.SetProperty(x => x.Role, Discorda.Core.Workspaces.MemberRole.Member), ct);
            var membership = await db.WorkspaceMembers.SingleAsync(x => x.WorkspaceId == GroupId && x.UserId == user, ct);
            var channels = await db.Channels.Where(x => x.WorkspaceId == GroupId && x.ArchivedAt == null && x.Type == ChannelType.Text)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name).Select(x => new { x.Id, x.Name }).ToListAsync(ct);
            var voiceChannels = await db.Channels.Where(x => x.WorkspaceId == GroupId && x.ArchivedAt == null && x.Type == ChannelType.Voice).OrderBy(x => x.SortOrder).Select(x => new { x.Id, x.Name }).ToListAsync(ct);
            // One bounded index seek per channel, rather than scanning the complete message history.
            var heads = await db.Channels.Where(c => c.WorkspaceId == GroupId && c.ArchivedAt == null && c.Type == ChannelType.Text)
                .Select(c => new { c.Id, LastId = db.Messages.Where(m => m.ChannelId == c.Id).OrderByDescending(m => m.Id).Select(m => (long?)m.Id).FirstOrDefault() })
                .ToDictionaryAsync(c => c.Id, c => c.LastId == null ? null : c.LastId.ToString(), ct);
            var effectiveRole = await Permissions.Role(ctx, app.Configuration, db, ct);
            return Results.Ok(new { workspace.Id, workspace.Name, isAdmin = Permissions.Rank(effectiveRole) >= 2, role = effectiveRole.ToString(), userId = user, channels = channels.Select(c => new {c.Id,c.Name,lastMessageId=heads.GetValueOrDefault(c.Id)}), voiceChannels });
        });
        api.MapPost("/channels", async (NewChannel input, HttpContext ctx, DiscordaDbContext db, LiveChat live, CancellationToken ct) =>
        {
            if (Permissions.Rank(await Permissions.Role(ctx, app.Configuration, db, ct)) < 2) return Results.Forbid();
            var name = input.Name?.Trim();
            if (string.IsNullOrWhiteSpace(name) || name.Length > 80 || name.Any(char.IsControl)) return Results.BadRequest();
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74891321)", ct);
            if (await db.Channels.CountAsync(c => c.WorkspaceId == GroupId && c.ArchivedAt == null, ct) >= 100) return Results.BadRequest();
            var channel = new Channel { WorkspaceId = GroupId, Name = name, Type = ChannelType.Text, SortOrder = 10 };
            db.Channels.Add(channel); Permissions.Audit(db, ctx, "channel.create", channel.Id.ToString()); await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            await live.Publish("channels", new { channel.Id });
            return Results.Ok(new { channel.Id, channel.Name });
        });
        api.MapGet("/channels/{channelId:guid}/messages", async (Guid channelId, long? before, HttpContext ctx, DiscordaDbContext db, LiveChat live, CancellationToken ct) =>
        {
            if (!await Access(db, channelId, UserId(ctx), ct)) return Results.NotFound();
            var ids = await db.Messages.Where(x => x.ChannelId == channelId && (!before.HasValue || x.Id < before.Value))
                .OrderByDescending(x => x.Id).Take(51).Select(x => x.Id).ToListAsync(ct);
            var hasMore = ids.Count > 50; var pageIds = ids.Take(50).ToArray();
            var items = await Views(db, x => x.ChannelId == channelId && pageIds.Contains(x.Id)).ToListAsync(ct);
            return Results.Ok(new { items = items.OrderBy(x => long.Parse(x.Id)), hasMore });
        });
        api.MapPost("/channels/{channelId:guid}/messages", async (Guid channelId, SendMessage input, HttpContext ctx, DiscordaDbContext db, LiveChat live, CancellationToken ct) =>
        {
            var user = UserId(ctx);
            if (!await Access(db, channelId, user, ct)) return Results.NotFound();
            if (!ValidBody(input.Body) || input.ClientId == Guid.Empty) return Results.BadRequest();
            var existing = await db.Messages.AsNoTracking().SingleOrDefaultAsync(x => x.AuthorId == user && x.ClientId == input.ClientId, ct);
            if (existing is not null) return existing.ChannelId == channelId ? Results.Ok(await Views(db, x => x.Id == existing.Id).SingleAsync(ct)) : Results.Conflict();
            if (input.ReplyToId is long parent && !await db.Messages.AnyAsync(x => x.Id == parent && x.ChannelId == channelId, ct)) return Results.BadRequest();
            // Atomic idempotency under retries and concurrent requests.
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO discorda.messages (\"ChannelId\", \"AuthorId\", \"ClientId\", \"Body\", \"ReplyToId\", \"CreatedAt\", \"Version\") VALUES ({channelId}, {user}, {input.ClientId}, {input.Body.Trim()}, {input.ReplyToId}, {DateTimeOffset.UtcNow}, 1) ON CONFLICT (\"AuthorId\", \"ClientId\") DO NOTHING", ct);
            var saved = await Views(db, x => x.AuthorId == user && x.ClientId == input.ClientId).SingleAsync(ct);
            if (saved.ChannelId == channelId) await live.Publish("message", saved);
            return saved.ChannelId == channelId ? Results.Ok(saved) : Results.Conflict();
        });
        api.MapPut("/channels/{channelId:guid}/messages/{id:long}", async (Guid channelId, long id, EditMessage input, HttpContext ctx, DiscordaDbContext db, LiveChat live, CancellationToken ct) =>
        {
            if (!await Access(db, channelId, UserId(ctx), ct)) return Results.NotFound();
            if (!ValidBody(input.Body) || input.Version < 1) return Results.BadRequest();
            var changed = await db.Messages.Where(x => x.Id == id && x.ChannelId == channelId && x.AuthorId == UserId(ctx) && x.DeletedAt == null && x.Version == input.Version)
                .ExecuteUpdateAsync(set => set.SetProperty(x => x.Body, input.Body.Trim()).SetProperty(x => x.EditedAt, DateTimeOffset.UtcNow).SetProperty(x => x.Version, x => x.Version + 1), ct);
            if (changed != 1) return Results.Conflict();
            var saved = await Views(db, x => x.Id == id).SingleAsync(ct);
            await live.Publish("message", saved);
            return Results.Ok(saved);
        });
        api.MapDelete("/channels/{channelId:guid}/messages/{id:long}", async (Guid channelId, long id, long version, HttpContext ctx, DiscordaDbContext db, LiveChat live, CancellationToken ct) =>
        {
            if (!await Access(db, channelId, UserId(ctx), ct)) return Results.NotFound();
            var moderator = Permissions.Rank(await Permissions.Role(ctx, app.Configuration, db, ct)) >= 1;
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var changed = await db.Messages.Where(x => x.Id == id && x.ChannelId == channelId && (x.AuthorId == UserId(ctx) || moderator) && x.DeletedAt == null && x.Version == version)
                .ExecuteUpdateAsync(set => set.SetProperty(x => x.Body, "").SetProperty(x => x.DeletedAt, DateTimeOffset.UtcNow).SetProperty(x => x.Version, x => x.Version + 1), ct);
            if (changed != 1) return Results.Conflict();
            if (moderator) { Permissions.Audit(db, ctx, "message.delete", id.ToString()); await db.SaveChangesAsync(ct); }
            await tx.CommitAsync(ct);
            var saved = await Views(db, x => x.Id == id).SingleAsync(ct);
            await live.Publish("message", saved);
            return Results.Ok(saved);
        });
    }
}



