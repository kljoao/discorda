using Discorda.Api.Auth;
using Discorda.Api.Chat;
using Discorda.Core.Channels;
using Discorda.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Discorda.Api.Media;

public static class TemporaryRooms
{
    public static void MapTemporaryRooms(this WebApplication app)
    {
        app.MapPost("/api/v1/chat/temporary-rooms", async (NewChannel input, HttpContext ctx, DiscordaDbContext db, LiveChat live, CancellationToken ct) =>
        {
            var user = ((MemberProfile)ctx.Items[typeof(MemberProfile)]!).Id;
            var name = input.Name?.Trim();
            if (string.IsNullOrWhiteSpace(name) || name.Length > 40 || name.Any(c => char.IsControl(c) || char.GetUnicodeCategory(c) == System.Globalization.UnicodeCategory.Format)) return Results.BadRequest();
            if (!await db.WorkspaceMembers.AnyAsync(m => m.UserId == user && m.WorkspaceId == ChatEndpoints.GroupId, ct)) return Results.Forbid();
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74891321)", ct);
            if (await db.Channels.CountAsync(c => c.WorkspaceId == ChatEndpoints.GroupId && c.ArchivedAt == null, ct) >= 100
                || await db.Channels.CountAsync(c => c.TemporaryOwnerId == user && c.ArchivedAt == null, ct) >= 2) return Results.Conflict();
            var room = new Channel { WorkspaceId = ChatEndpoints.GroupId, Name = name, Type = ChannelType.Voice, TemporaryOwnerId = user, EmptySince = DateTimeOffset.UtcNow, SortOrder = 100 };
            db.Channels.Add(room); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            await live.Publish("channels", new { room.Id }); return Results.Ok(new { room.Id, room.Name });
        }).RequireAuthorization("Member");
    }
    public static async Task Sweep(DiscordaDbContext db, MediaService media, LiveChat live, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74891321)", ct);
        var rooms = await db.Channels.Where(c => c.TemporaryOwnerId != null && c.ArchivedAt == null).ToListAsync(ct);
        var occupied = media.OccupiedChannels;
        var now = DateTimeOffset.UtcNow; var changed = false;
        foreach (var room in rooms)
        {
            if (occupied.Contains(room.Id)) room.EmptySince = null;
            else if (room.EmptySince is null) room.EmptySince = now;
            else if (room.EmptySince < now.AddMinutes(-2)) { room.ArchivedAt = now; room.Version++; changed = true; }
        }
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        if (changed) await live.Publish("channels", new { id = Guid.Empty });
    }
}
